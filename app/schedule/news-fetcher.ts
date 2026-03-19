/**
 * news-fetcher — 每小时自动抓取日本新闻并 AI 注释
 *
 * 流程:
 *   1. 从 Yahoo!/NHK/朝日 抓取最新文章，去重后写入 news 表（status=draft）
 *   2. 对 draft 文章逐篇调用 ProductAI 生成注释
 *   3. 注释完成且质量达标的文章标记为 published，用户才能看到
 *   4. 清理 1 年前的旧文章
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
    disable: true,     // 暂停：新闻系统重构中
  };
  async subscribe() {
    const ctx = this.ctx;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bizConfig = (ctx.app.config as any).bizConfig;
    const aiConfig: ProductAIConfig = bizConfig?.productAi;
    const ossConfig = bizConfig?.oss;

    // 1. 抓取新文章（含即时全文抓取 + 图片转存 OSS），status=draft
    const fetcher = new NewsFetcherService();
    const { inserted, skipped, enriched } = await fetcher.fetchAll(ctx, ossConfig);
    ctx.logger.info(`[NewsFetcher] Fetched: +${inserted} new (${enriched} enriched), ${skipped} skipped`);

    // 2. 对 draft 文章生成 AI 注释，成功后标记为 published（每次最多 5 篇）
    if (aiConfig) {
      const annotator = new NewsAnnotatorService(aiConfig);
      const drafts = await ctx.model.News.find({ status: 'draft' }).limit(20);

      let annotated = 0;
      for (const row of drafts as unknown[]) {
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

        // 质量门控：必须有封面图才能发布
        const hasImage = !!(article.imageUrl as string);

        if (existing.paragraphs?.length > 0) {
          // 已有注释但还是 draft，检查图片后发布
          if (hasImage) {
            await ctx.model.News.update(
              { id: article.id },
              { status: 'published' },
            );
          }
          continue;
        }

        const updated = await annotator.annotate(
          article.title as string,
          article.content as string,
          article.difficulty as string,
          existing,
        );

        if (updated.paragraphs?.length > 0) {
          // 从 AI 注释段落生成干净的摘要（取前 200 字）
          const aiSummary = updated.paragraphs
            .map((p: { text?: string }) => p.text || '')
            .join(' ')
            .slice(0, 200);
          // 注释成功 → 保存注释+摘要，有图则发布
          await ctx.model.News.update(
            { id: article.id },
            {
              annotations: JSON.stringify(updated),
              summary: aiSummary || (article.summary as string),
              status: hasImage ? 'published' : 'draft',
            },
          );
          if (hasImage) annotated++;
        }
      }
      ctx.logger.info(`[NewsFetcher] Annotated & published ${annotated} articles`);
    }

    // 3. 清理 1 年前的旧文章
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 3600000);
    await ctx.model.News.remove({ publishedAt: { $lt: oneYearAgo } });
  }
}
