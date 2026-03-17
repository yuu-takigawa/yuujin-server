/**
 * news-fetcher — 每小时自动抓取日本新闻并 AI 注释
 *
 * 流程:
 *   1. 从 NHK Web Easy / NHK News / 朝日新聞 抓取最新文章
 *   2. 去重（source_url）后写入 news 表
 *   3. 对无注释文章逐篇调用 ProductAI 生成注释
 *   4. 清理 7 天前的旧文章（保持数据库整洁）
 */

import { Subscription } from 'egg';
import { NewsFetcherService } from '../module/news/fetcher/NewsFetcherService';
import { NewsAnnotatorService, NewsAnnotations } from '../module/news/fetcher/NewsAnnotatorService';
import { ProductAIConfig } from '../module/ai/ProductAIService';

function boneData(bone: unknown): Record<string, unknown> {
  if (bone && typeof (bone as { getRaw?: () => Record<string, unknown> }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone as Record<string, unknown>;
}

export default class NewsFetcher extends Subscription {
  static schedule = {
    cron: '0 * * * *', // 每整点运行
    type: 'worker',
    immediate: true,   // 启动时立即运行一次
  };
  async subscribe() {
    const ctx = this.ctx;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bizConfig = (ctx.app.config as any).bizConfig;
    const aiConfig: ProductAIConfig = bizConfig?.productAi;

    // 1. 抓取新文章
    const fetcher = new NewsFetcherService();
    const { inserted, skipped } = await fetcher.fetchAll(ctx);
    ctx.logger.info(`[NewsFetcher] Fetched: +${inserted} new, ${skipped} skipped`);

    // 2. 对无注释文章生成 AI 注释（每次最多处理 5 篇，避免超时）
    if (aiConfig) {
      const annotator = new NewsAnnotatorService(aiConfig);
      const unannotated = await ctx.model.News.find({}).limit(20);

      let annotated = 0;
      for (const row of unannotated as unknown[]) {
        if (annotated >= 5) break;
        const article = boneData(row);

        let existing: NewsAnnotations;
        try {
          existing = typeof article.annotations === 'string'
            ? JSON.parse(article.annotations as string) as NewsAnnotations
            : (article.annotations as NewsAnnotations) || { imageEmoji: '📰', paragraphs: [], comments: [] };
        } catch {
          existing = { imageEmoji: '📰', paragraphs: [], comments: [] };
        }

        if (existing.paragraphs?.length > 0) continue; // 已有注释，跳过

        const updated = await annotator.annotate(
          article.title as string,
          article.content as string,
          article.difficulty as string,
          existing,
        );

        if (updated.paragraphs.length > 0) {
          await ctx.model.News.update(
            { id: article.id },
            { annotations: JSON.stringify(updated) },
          );
          annotated++;
        }
      }
      ctx.logger.info(`[NewsFetcher] Annotated ${annotated} articles`);
    }

    // 3. 清理 7 天前的旧文章
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000);
    await ctx.model.News.remove({ publishedAt: { $lt: sevenDaysAgo } });
  }
}
