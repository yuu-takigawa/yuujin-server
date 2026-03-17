/**
 * GrowthEngine — 角色灵魂成长引擎
 *
 * 每 5 分钟扫描一次：
 *   找到「最后一条消息超过 60 分钟未处理」的 friendship，
 *   用 ProductAI 演化 soul（角色对本用户的个性）和 memory（角色对本用户的记忆），
 *   写回 friendships 表。
 */

import { Subscription } from 'egg';
import { productAIChat, ProductAIConfig } from '../module/ai/ProductAIService';

/** 触发成长的最低消息数 */
const MIN_MESSAGES_TO_GROW = 3;
/** 最后一条消息多久后才触发成长（毫秒） */
const IDLE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

export const schedule = {
  interval: '5m',
  type: 'worker', // 只有一个 worker 执行，避免并发
  immediate: false,
};

function boneToRaw(bone: unknown): Record<string, unknown> {
  if (bone && typeof (bone as { getRaw?: () => Record<string, unknown> }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone as Record<string, unknown>;
}

export default class GrowthEngine extends Subscription {
  async subscribe() {
    const ctx = this.ctx;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bizConfig = (ctx.app.config as any).bizConfig;
    const aiConfig: ProductAIConfig = bizConfig?.productAi;

    if (!aiConfig) {
      ctx.logger.warn('[GrowthEngine] productAi config not found, skipping');
      return;
    }

    const now = new Date();
    const idleThreshold = new Date(now.getTime() - IDLE_THRESHOLD_MS);

    // 找出所有 last_growth_at 为 null 或早于 idleThreshold 的 friendship
    let friendships: Record<string, unknown>[];
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await (ctx.model as any).Friendship.find({
        $or: [
          { lastGrowthAt: null },
          { lastGrowthAt: { $lt: idleThreshold } },
        ],
      });
      friendships = (rows as unknown[]).map(boneToRaw);
    } catch (err) {
      ctx.logger.error('[GrowthEngine] Failed to query friendships:', err);
      return;
    }

    for (const friendship of friendships) {
      try {
        await this.growFriendship(ctx, friendship, aiConfig, idleThreshold);
      } catch (err) {
        ctx.logger.error(`[GrowthEngine] Unhandled error for friendship ${friendship.id}:`, err);
      }
    }
  }

  private async growFriendship(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx: any,
    friendship: Record<string, unknown>,
    aiConfig: ProductAIConfig,
    idleThreshold: Date,
  ) {
    const { id: friendshipId, userId, characterId, soul, memory, lastGrowthAt } = friendship;

    // 找出该 friendship 的所有 conversation ids
    const convRows = await ctx.model.Conversation.find({ userId, characterId });
    if (!convRows || convRows.length === 0) return;

    const conversationIds = (convRows as unknown[]).map((c) => boneToRaw(c).id);

    // 查最近一条消息时间
    const latestRows = await ctx.model.Message.find({
      conversationId: conversationIds,
    }).order('created_at DESC').limit(1);

    if (!latestRows || latestRows.length === 0) return;

    const latestMsg = boneToRaw(latestRows[0]);
    const latestTime = latestMsg.createdAt as Date;

    // 最新消息还不满 1 小时，跳过
    if (latestTime && latestTime > idleThreshold) return;

    // 获取 last_growth_at 之后的新消息
    const since = lastGrowthAt ? new Date(lastGrowthAt as string | Date) : new Date(0);
    const recentRows = await ctx.model.Message.find({
      conversationId: conversationIds,
      createdAt: { $gt: since },
    }).order('created_at ASC').limit(200);

    if (!recentRows || recentRows.length < MIN_MESSAGES_TO_GROW) return;

    const recentMessages = (recentRows as unknown[]).map(boneToRaw);

    // 加载角色信息
    const charRow = await ctx.model.Character.findOne({ id: characterId });
    if (!charRow) return;
    const charData = boneToRaw(charRow);

    // 构建对话历史文本
    const dialogText = recentMessages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => `[${m.role === 'user' ? 'ユーザー' : charData.name}]: ${m.content}`)
      .join('\n');

    const systemPrompt = `あなたは ${charData.name} というキャラクターです。`;

    const userPrompt = `
以下は、あなた（${charData.name}）とあるユーザーとの最近の会話記録です。

--- 会話記録 ---
${dialogText}
--- 会話記録終わり ---

現在のSOUL（このユーザーへの向き合い方）:
${soul || '（まだ形成されていない）'}

現在のMEMORY（このユーザーについての記憶）:
${memory || '（まだ記憶がない）'}

上記の会話をふまえて、以下のJSON形式で更新してください：

{
  "soul": "（${charData.name}がこのユーザーに対して感じている印象・態度・感情の変化を自然な日本語で300字以内に。初回なら初期印象を）",
  "memory": "（${charData.name}がこのユーザーについて覚えておきたい重要な事実・好み・出来事を箇条書きで500字以内に）"
}

JSONのみ返してください。説明文は不要です。`.trim();

    const responseText = await productAIChat(
      aiConfig,
      [{ role: 'user', content: userPrompt }],
      systemPrompt,
    );

    // Parse JSON response
    let parsed: { soul?: string; memory?: string } = {};
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      ctx.logger.warn(`[GrowthEngine] Failed to parse AI response for friendship ${friendshipId}:`, parseErr);
      return;
    }

    if (!parsed.soul && !parsed.memory) return;

    const updates: Record<string, unknown> = { lastGrowthAt: new Date() };
    if (parsed.soul) updates.soul = parsed.soul;
    if (parsed.memory) updates.memory = parsed.memory;

    await ctx.model.Friendship.update({ id: friendshipId }, updates);

    ctx.logger.info(`[GrowthEngine] Grew friendship ${friendshipId} (user:${userId}, char:${characterId})`);
  }
}
