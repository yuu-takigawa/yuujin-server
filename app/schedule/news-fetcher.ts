/**
 * news-fetcher — 每 2 小时抓取新闻，发布 1 篇
 *
 * 流程:
 *   1. 从 5 个垂直源抓取文章，去重+黑名单过滤后存 draft
 *   2. 选 1 篇有封面图的 draft → 阿里云图片审核 → 通过则 published
 *   3. 发布后 spawn 子进程生成振り仮名（kuromoji），存入 annotations.furigana
 *   4. 审核不通过 → 删除该文章
 *   5. 清理 1 年前的旧文章
 */

import { Subscription } from 'egg';
import { execFile } from 'child_process';
import * as path from 'path';
import { NewsFetcherService } from '../module/news/fetcher/NewsFetcherService';
import { ContentModerationService } from '../module/avatar/ContentModerationService';

function boneData(bone: unknown): Record<string, unknown> {
  if (bone && typeof (bone as { getRaw?: () => Record<string, unknown> }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone as Record<string, unknown>;
}

/**
 * 子进程生成振り仮名。kuromoji 词典在子进程中加载，
 * 处理完成后子进程退出，内存随之释放，不影响主进程。
 */
function generateFuriganaInWorker(
  paragraphs: string[],
): Promise<Record<string, [string, string][]>> {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(process.cwd(), 'scripts', 'furigana-worker.js');
    const child = execFile('node', [workerPath], {
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`furigana worker failed: ${stderr || err.message}`));
        return;
      }
      try {
        const result = JSON.parse(stdout) as { furigana: Record<string, [string, string][]> };
        resolve(result.furigana);
      } catch {
        reject(new Error(`furigana worker invalid output: ${stdout.slice(0, 200)}`));
      }
    });
    child.stdin?.write(JSON.stringify({ paragraphs }));
    child.stdin?.end();
  });
}

export default class NewsFetcher extends Subscription {
  static schedule = {
    cron: '0 * * * *', // 每 1 小时
    type: 'worker',
    immediate: true,    // 启动时立即运行一次
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
    //    优先发布今天更新不足 2 篇的频道
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayPublished = await ctx.model.News.find({
      status: 'published',
      publishedAt: { $gt: todayStart },
    });
    const categoryCounts: Record<string, number> = {};
    for (const row of todayPublished as unknown[]) {
      const cat = (boneData(row).category as string) || '';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
    const MIN_PER_DAY = 2;
    const allCategories = ['ai', 'music', 'comic', 'tech', 'lifestyle'];
    const needyCategories = allCategories.filter(c => (categoryCounts[c] || 0) < MIN_PER_DAY);

    const drafts = await ctx.model.News.find({ status: 'draft' })
      .order('published_at DESC')
      .limit(20);

    // 排序：优先需要更新的频道
    const sortedDrafts = (drafts as unknown[]).map(boneData).sort((a, b) => {
      const aN = needyCategories.includes(a.category as string) ? 0 : 1;
      const bN = needyCategories.includes(b.category as string) ? 0 : 1;
      return aN - bN;
    });

    let published = 0;
    const moderator = new ContentModerationService({
      accessKeyId: ossConfig?.accessKeyId || '',
      accessKeySecret: ossConfig?.accessKeySecret || '',
    });

    for (const article of sortedDrafts) {
      if (published >= 1) break;
      const imageUrl = article.imageUrl as string;

      // 无封面图的文章跳过
      if (!imageUrl) continue;

      // 阿里云图片内容审核
      const result = await moderator.moderate(imageUrl);
      if (!result.pass) {
        ctx.logger.info(`[NewsFetcher] Image moderation failed for ${article.id}: ${result.reason}`);
        await ctx.model.News.remove({ id: article.id });
        continue;
      }

      // 审核通过 → 生成振り仮名 → 发布
      const content = article.content as string;
      const paragraphs = content.split('\n').filter((p: string) => p.trim().length > 0);

      let annotations: Record<string, unknown>;
      try {
        annotations = typeof article.annotations === 'string'
          ? JSON.parse(article.annotations as string)
          : (article.annotations as Record<string, unknown>) || {};
      } catch {
        annotations = {};
      }

      try {
        const furigana = await generateFuriganaInWorker(paragraphs);
        annotations.furigana = furigana;
        ctx.logger.info(`[NewsFetcher] Furigana generated for ${article.id}: ${Object.keys(furigana).length} paragraphs`);
      } catch (err) {
        ctx.logger.warn(`[NewsFetcher] Furigana failed for ${article.id}: ${err}`);
        // 注音失败不阻塞发布
      }

      await ctx.model.News.update(
        { id: article.id },
        {
          status: 'published',
          annotations: JSON.stringify(annotations),
        },
      );
      published++;
      ctx.logger.info(`[NewsFetcher] Published: ${article.title}`);
    }

    // 3. 清理 1 年前的旧文章
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 3600000);
    await ctx.model.News.remove({ publishedAt: { $lt: oneYearAgo } });
  }
}
