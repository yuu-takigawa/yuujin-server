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
import { buildGrowthPrompt, buildConversationSummaryPrompt } from 'yuujin-prompts';
import { TopicService } from '../module/topic/TopicService';

/** 触发成长的最低消息数 */
const MIN_MESSAGES_TO_GROW = 3;
/** 最后一条消息多久后才触发成长（毫秒） */
const IDLE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
/** 触发对话归档的消息数阈值 */
const ARCHIVE_THRESHOLD = 100;
/** 归档时保留的最近消息数 */
const ARCHIVE_KEEP_RECENT = 30;

function boneToRaw(bone: unknown): Record<string, unknown> {
  if (bone && typeof (bone as { getRaw?: () => Record<string, unknown> }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone as Record<string, unknown>;
}

export default class GrowthEngine extends Subscription {
  static schedule = {
    interval: '5m',
    type: 'worker', // 只有一个 worker 执行，避免并发
    immediate: false,
  };

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

    const { system: systemPrompt, user: userPrompt } = buildGrowthPrompt(
      charData.name as string,
      dialogText,
      soul as string | null,
      memory as string | null,
    );

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

    // Pre-generate topic cards alongside soul/memory growth
    try {
      const topicService = new TopicService();
      await topicService.preGenerate(ctx, userId as string, characterId as string, aiConfig);
      ctx.logger.info(`[GrowthEngine] Pre-generated topics for friendship ${friendshipId}`);
    } catch (err) {
      ctx.logger.warn(`[GrowthEngine] Topic pre-generation failed for ${friendshipId}:`, err);
    }

    // Archive conversation history if total messages exceed threshold
    try {
      await this.archiveIfNeeded(ctx, friendship, conversationIds, charData, aiConfig);
    } catch (err) {
      ctx.logger.warn(`[GrowthEngine] Archive failed for ${friendshipId}:`, err);
    }
  }

  private async archiveIfNeeded(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx: any,
    friendship: Record<string, unknown>,
    conversationIds: unknown[],
    charData: Record<string, unknown>,
    aiConfig: ProductAIConfig,
  ) {
    const friendshipId = friendship.id;

    // Count total messages across all conversations
    const allMessages = await ctx.model.Message.find({
      conversationId: conversationIds,
    }).order('created_at ASC');

    const totalCount = allMessages ? allMessages.length : 0;
    if (totalCount <= ARCHIVE_THRESHOLD) return;

    const allMsgs = (allMessages as unknown[]).map(boneToRaw);

    // Messages to archive = all except the most recent ARCHIVE_KEEP_RECENT
    const toArchive = allMsgs.slice(0, totalCount - ARCHIVE_KEEP_RECENT);
    if (toArchive.length === 0) return;

    // Build dialog text from messages to archive
    const archiveDialogText = toArchive
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => `[${m.role === 'user' ? 'ユーザー' : charData.name}]: ${m.content}`)
      .join('\n');

    const existingSummary = (friendship.conversationSummary as string) || null;

    const { system: sysPrompt, user: userPrompt } = buildConversationSummaryPrompt(
      charData.name as string,
      archiveDialogText,
      existingSummary,
    );

    const summaryText = await productAIChat(
      aiConfig,
      [{ role: 'user', content: userPrompt }],
      sysPrompt,
    );

    if (!summaryText?.trim()) return;

    // Save summary and mark archived messages
    await ctx.model.Friendship.update(
      { id: friendshipId },
      { conversationSummary: summaryText.trim() },
    );

    // Mark archived messages (set metadata.archived = true)
    const archiveIds = toArchive.map((m) => m.id);
    for (const msgId of archiveIds) {
      await ctx.model.Message.update({ id: msgId }, { metadata: JSON.stringify({ archived: true }) });
    }

    ctx.logger.info(`[GrowthEngine] Archived ${archiveIds.length} messages for friendship ${friendshipId}, kept ${ARCHIVE_KEEP_RECENT} recent`);
  }
}
