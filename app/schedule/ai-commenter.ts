/**
 * ai-commenter — AI 角色自动评论新闻
 *
 * 每 4 小时：
 *   1. 找 48h 内发布、且 AI 评论数 < 3 的新闻
 *   2. 随机选未评论该文章的 preset 角色
 *   3. 限制每角色每天最多 3 条评论
 *   4. 调用 ProductAI 生成评论 → 写入 news_comments
 */

import { Subscription } from 'egg';
import { productAIChat, ProductAIConfig } from '../module/ai/ProductAIService';
import { v4 as uuidv4 } from 'uuid';

const PRESET_CHARACTER_IDS = [
  'preset-sato-yuki',
  'preset-tanaka-kenta',
  'preset-yamamoto-sakura',
];

const MAX_COMMENTS_PER_ARTICLE = 3;
const MAX_COMMENTS_PER_CHARACTER_PER_DAY = 3;

function boneData(bone: unknown): Record<string, unknown> {
  if (bone && typeof (bone as { getRaw?: () => Record<string, unknown> }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone as Record<string, unknown>;
}

export default class AICommenter extends Subscription {
  static schedule = {
    interval: '4h',
    type: 'worker',
    immediate: false,
  };

  async subscribe() {
    const ctx = this.ctx;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aiConfig: ProductAIConfig = (ctx.app.config as any).bizConfig?.productAi;
    if (!aiConfig) return;

    // 统计今日各角色已评论数
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const dailyCounts: Record<string, number> = {};
    for (const charId of PRESET_CHARACTER_IDS) {
      const todayComments = await ctx.model.NewsComment.find({
        characterId: charId,
        isAi: 1,
        createdAt: { $gt: todayStart },
      });
      dailyCounts[charId] = (todayComments as unknown[]).length;
    }

    // 找 48h 内发布的新闻
    const since = new Date(Date.now() - 48 * 3600000);
    const recentNews = await ctx.model.News.find({
      status: 'published',
      publishedAt: { $gt: since },
    }).order('published_at DESC').limit(10);

    for (const newsRow of recentNews as unknown[]) {
      const article = boneData(newsRow);

      // 这篇文章的 AI 评论数
      const existingAiComments = await ctx.model.NewsComment.find({
        newsId: article.id,
        isAi: 1,
      });
      if ((existingAiComments as unknown[]).length >= MAX_COMMENTS_PER_ARTICLE) continue;

      // 已评论角色
      const commentedCharIds = new Set(
        (existingAiComments as unknown[]).map((c) => boneData(c).characterId as string),
      );

      // 选一个可用角色（未评论该文章 + 今日未超额）
      const available = PRESET_CHARACTER_IDS.filter(
        (id) => !commentedCharIds.has(id) && (dailyCounts[id] || 0) < MAX_COMMENTS_PER_CHARACTER_PER_DAY,
      );
      if (available.length === 0) continue;

      const characterId = available[Math.floor(Math.random() * available.length)];
      const charRow = await ctx.model.Character.findOne({ id: characterId });
      if (!charRow) continue;
      const character = boneData(charRow);

      await this.generateComment(ctx, aiConfig, article, character);
      dailyCounts[characterId] = (dailyCounts[characterId] || 0) + 1;
    }
  }

  private async generateComment(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx: any,
    aiConfig: ProductAIConfig,
    article: Record<string, unknown>,
    character: Record<string, unknown>,
  ) {
    const systemPrompt = `あなたは ${character.name} です。${character.bio || ''}
SNSの短い投稿のように、ニュースへのリアクションを一言コメントしてください。
- 自分のキャラクターの口調を使う
- 50字以内で
- ハッシュタグ不要、絵文字1〜2個OK`;

    const userPrompt = `ニュース: 「${article.title}」\nこのニュースへのあなたのコメントを教えてください。`;

    try {
      const content = await productAIChat(
        aiConfig,
        [{ role: 'user', content: userPrompt }],
        systemPrompt,
      );

      if (!content.trim()) return;

      await ctx.model.NewsComment.create({
        id: uuidv4(),
        newsId: article.id,
        characterId: character.id,
        content: content.trim().slice(0, 200),
        isAi: 1,
      });

      ctx.logger.info(`[AICommenter] ${character.name} commented on news ${article.id}`);
    } catch (err) {
      ctx.logger.warn(`[AICommenter] Failed to generate comment:`, err);
    }
  }
}
