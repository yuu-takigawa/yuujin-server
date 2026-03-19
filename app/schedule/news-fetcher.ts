/**
 * news-fetcher — 每 2 小时抓取新闻，发布 1 篇
 *
 * 流程:
 *   1. 从 5 个垂直源抓取文章，去重+黑名单过滤后存 draft
 *   2. 选 1 篇有封面图的 draft → 阿里云图片审核 → 通过则 published
 *   3. 审核不通过 → 删除该文章
 *   4. 清理 1 年前的旧文章
 */

import { Subscription } from 'egg';
import { NewsFetcherService } from '../module/news/fetcher/NewsFetcherService';
import { ContentModerationService } from '../module/avatar/ContentModerationService';

function boneData(bone: unknown): Record<string, unknown> {
  if (bone && typeof (bone as { getRaw?: () => Record<string, unknown> }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone as Record<string, unknown>;
}

export default class NewsFetcher extends Subscription {
  static schedule = {
    cron: '0 */2 * * *', // 每 2 小时
    type: 'worker',
    immediate: true,      // 启动时立即运行一次
  };

  async subscribe() {
    const ctx = this.ctx;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bizConfig = (ctx.app.config as any).bizConfig;
    const ossConfig = bizConfig?.oss;

    // 1. 抓取新文章（含即时全文抓取 + 图片转存 OSS），status=draft
    const fetcher = new NewsFetcherService();
    const { inserted, skipped, enriched } = await fetcher.fetchAll(ctx, ossConfig);
    ctx.logger.info(`[NewsFetcher] Fetched: +${inserted} new (${enriched} enriched), ${skipped} skipped`);

    // 2. 选 1 篇有封面图的 draft → 图片审核 → 发布
    const drafts = await ctx.model.News.find({ status: 'draft' })
      .order('published_at DESC')
      .limit(10);

    let published = 0;
    const moderator = new ContentModerationService({
      accessKeyId: ossConfig?.accessKeyId || '',
      accessKeySecret: ossConfig?.accessKeySecret || '',
    });

    for (const row of drafts as unknown[]) {
      if (published >= 1) break;
      const article = boneData(row);
      const imageUrl = article.imageUrl as string;

      // 无封面图的文章跳过（不删除，等后续可能的补图）
      if (!imageUrl) continue;

      // 阿里云图片内容审核
      const result = await moderator.moderate(imageUrl);
      if (!result.pass) {
        ctx.logger.info(`[NewsFetcher] Image moderation failed for ${article.id}: ${result.reason}`);
        await ctx.model.News.remove({ id: article.id });
        continue;
      }

      // 审核通过 → 发布
      await ctx.model.News.update(
        { id: article.id },
        { status: 'published' },
      );
      published++;
      ctx.logger.info(`[NewsFetcher] Published: ${article.title}`);
    }

    // 3. 清理 1 年前的旧文章
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 3600000);
    await ctx.model.News.remove({ publishedAt: { $lt: oneYearAgo } });
  }
}
