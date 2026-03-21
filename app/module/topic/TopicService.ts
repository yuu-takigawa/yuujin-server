/**
 * TopicService — 话题抽卡（预生成 + 按需随机）
 *
 * draw():      从 DB 读取预生成话题卡，不够时 fallback 到默认
 * shuffle():   实时 AI 生成 1 张新话题卡（消耗积分）
 * preGenerate(): 批量预生成话题卡（由 GrowthEngine 调用）
 */

import { ContextProto, AccessLevel } from '@eggjs/tegg';
import { Context } from 'egg';
import { v4 as uuidv4 } from 'uuid';
import { productAIChat, ProductAIConfig } from '../ai/ProductAIService';

export interface TopicCard {
  id: string;
  text: string;
  emoji: string;
}

function boneData(bone: unknown): Record<string, unknown> {
  if (bone && typeof (bone as { getRaw?: () => Record<string, unknown> }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone as Record<string, unknown>;
}

@ContextProto({
  accessLevel: AccessLevel.PUBLIC,
})
export class TopicService {
  /**
   * Draw topics: read pre-generated cards from DB, fallback to defaults
   */
  async draw(ctx: Context, userId: string, characterId: string): Promise<TopicCard[]> {
    // Read up to 5 unused pre-generated cards
    const rows = await ctx.model.TopicCard.find({
      userId,
      characterId,
      used: 0,
    }).order('created_at DESC').limit(5);

    const cards = (rows as unknown[]).map(boneData);

    if (cards.length >= 3) {
      return cards.map((c) => ({
        id: c.id as string,
        text: c.text as string,
        emoji: (c.emoji as string) || '💬',
      }));
    }

    // Not enough pre-generated cards — return defaults
    return DEFAULT_TOPICS.map((t, i) => ({
      id: `topic-default-${i}`,
      text: t.text,
      emoji: t.emoji,
    }));
  }

  /**
   * Shuffle: AI generates 1 new topic card in real-time (costs credits)
   */
  async shuffle(ctx: Context, userId: string, characterId: string): Promise<TopicCard> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aiConfig: ProductAIConfig = (ctx.app.config as any).bizConfig?.productAi;

    const charRow = await ctx.model.Character.findOne({ id: characterId });
    if (!charRow) throw new Error('Character not found');
    const character = boneData(charRow);

    const friendRow = await ctx.model.Friendship.findOne({ userId, characterId });
    const memory = friendRow ? (boneData(friendRow).memory as string) || '' : '';

    const systemPrompt = 'あなたは会話話題生成AIです。1つだけ話題を生成してください。';
    const userPrompt = `
キャラクター: ${character.name}（${character.occupation || ''}）
記憶: ${memory || '（なし）'}

この人と自然に話せる具体的な話題を1つ提案してください。
JSON形式: { "text": "20字以内", "emoji": "絵文字1つ" }
JSONのみ返してください。`.trim();

    try {
      const response = await productAIChat(
        aiConfig,
        [{ role: 'user', content: userPrompt }],
        systemPrompt,
      );

      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as { text: string; emoji: string };
        const card: TopicCard = {
          id: `topic-shuffle-${Date.now()}`,
          text: parsed.text || '何か面白いことある？',
          emoji: parsed.emoji || '🎲',
        };
        return card;
      }
    } catch { /* fallback */ }

    return { id: `topic-shuffle-${Date.now()}`, text: '最近何してた？', emoji: '😊' };
  }

  /**
   * Pre-generate topic cards for a friendship (called by GrowthEngine)
   */
  async preGenerate(ctx: Context, userId: string, characterId: string, aiConfig: ProductAIConfig): Promise<void> {
    // Check existing unused count
    const existingRows = await ctx.model.TopicCard.find({
      userId,
      characterId,
      used: 0,
    });
    const existingCount = (existingRows as unknown[]).length;

    if (existingCount >= 5) return; // Already enough

    const needed = 5 - existingCount;

    const charRow = await ctx.model.Character.findOne({ id: characterId });
    if (!charRow) return;
    const character = boneData(charRow);

    const friendRow = await ctx.model.Friendship.findOne({ userId, characterId });
    const memory = friendRow ? (boneData(friendRow).memory as string) || '' : '';

    // Load recent dialog
    const convRow = await ctx.model.Conversation.findOne({ userId, characterId });
    let recentDialog = '';
    if (convRow) {
      const conv = boneData(convRow);
      const recentMessages = await ctx.model.Message.find({
        conversationId: conv.id,
      }).order('created_at DESC').limit(6);
      recentDialog = (recentMessages as unknown[])
        .map(boneData)
        .reverse()
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => `[${m.role === 'user' ? 'ユーザー' : character.name}]: ${(m.content as string).slice(0, 80)}`)
        .join('\n');
    }

    const systemPrompt = 'あなたは会話話題生成AIです。JSON配列で返してください。';
    const userPrompt = `
キャラクター: ${character.name}（${character.occupation || ''}）
記憶: ${memory || '（なし）'}
最近の会話:
${recentDialog || '（まだ会話がない）'}

${needed}つの話題を提案。JSON配列: [{ "text": "20字以内", "emoji": "絵文字1つ" }, ...]
JSONのみ。`.trim();

    try {
      const response = await productAIChat(
        aiConfig,
        [{ role: 'user', content: userPrompt }],
        systemPrompt,
      );

      const match = response.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]) as Array<{ text: string; emoji: string }>;
        for (const t of parsed.slice(0, needed)) {
          await ctx.model.TopicCard.create({
            id: uuidv4(),
            characterId,
            userId,
            text: (t.text || '').slice(0, 100),
            emoji: t.emoji || '💬',
            used: 0,
          });
        }
      }
    } catch (err) {
      ctx.logger.warn('[TopicService] preGenerate failed:', err);
    }
  }
}

const DEFAULT_TOPICS = [
  { text: '最近何してた？', emoji: '😊' },
  { text: '好きな食べ物は？', emoji: '🍜' },
  { text: '休日の過ごし方', emoji: '🌿' },
  { text: '最近見た映画やドラマ', emoji: '🎬' },
  { text: '今日のニュースについて', emoji: '📰' },
];
