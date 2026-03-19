import { PassThrough } from 'stream';
import {
  HTTPController,
  HTTPMethod,
  HTTPMethodEnum,
  HTTPParam,
  Inject,
  Context,
} from '@eggjs/tegg';
import { EggContext } from '@eggjs/tegg';
import { Context as EggCtx } from 'egg';
import { NewsService } from './NewsService';
import { NewsAnnotatorService } from './fetcher/NewsAnnotatorService';
import { ProductAIConfig } from '../ai/ProductAIService';

@HTTPController({
  path: '/news',
})
export class NewsController {
  @Inject()
  newsService!: NewsService;

  @HTTPMethod({
    method: HTTPMethodEnum.GET,
    path: '/',
  })
  async list(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const query = eggCtx.query as Record<string, string>;

    const { articles, hasMore } = await this.newsService.list(eggCtx, {
      category: query.category,
      limit: query.limit ? parseInt(query.limit) : undefined,
      offset: query.offset ? parseInt(query.offset) : undefined,
    });

    // Optionally include read status for authenticated user
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    let readMap: Record<string, boolean> = {};
    if (userId) {
      const newsIds = articles.map((a: Record<string, unknown>) => a.id as string);
      readMap = await this.newsService.getReadStatus(eggCtx, userId, newsIds);
    }

    const result = articles.map((a: Record<string, unknown>) => ({
      ...a,
      isRead: !!readMap[a.id as string],
    }));

    return { success: true, data: { articles: result, hasMore } };
  }

  @HTTPMethod({
    method: HTTPMethodEnum.GET,
    path: '/:id',
  })
  async get(@Context() ctx: EggContext, @HTTPParam() id: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const article = await this.newsService.getById(eggCtx, id);
    if (!article) {
      eggCtx.status = 404;
      return { success: false, error: 'News article not found' };
    }
    return { success: true, data: article };
  }

  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/:id/read',
  })
  async markAsRead(@Context() ctx: EggContext, @HTTPParam() id: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const success = await this.newsService.markAsRead(eggCtx, userId, id);
    if (!success) {
      eggCtx.status = 404;
      return { success: false, error: 'News article not found' };
    }
    return { success: true };
  }

  /**
   * 按需段落注释 — SSE 流式返回翻译/解说
   *
   * POST /news/:id/annotate
   * Body: { paragraphIndex: number, type: 'translation' | 'explanation' }
   *
   * SSE events:
   *   { type: 'start' }
   *   { type: 'delta', content: '...' }   // 流式内容片段
   *   { type: 'done', cached: boolean }    // 完成
   *   { type: 'error', error: '...' }      // 出错
   */
  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/:id/annotate',
  })
  async annotate(@Context() ctx: EggContext, @HTTPParam() id: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const body = eggCtx.request.body as {
      paragraphIndex?: number;
      type?: string;
    };

    const { paragraphIndex, type } = body;
    if (paragraphIndex === undefined || !type || !['translation', 'explanation'].includes(type)) {
      eggCtx.status = 400;
      return { success: false, error: 'paragraphIndex (number) and type (translation|explanation) are required' };
    }

    // 获取文章
    const article = await this.newsService.getById(eggCtx, id);
    if (!article) {
      eggCtx.status = 404;
      return { success: false, error: 'News article not found' };
    }

    // 获取段落文本（content 按 \n 分割）
    const content = (article as Record<string, unknown>).content as string;
    const paragraphs = content.split('\n').filter(p => p.trim().length > 0);
    if (paragraphIndex < 0 || paragraphIndex >= paragraphs.length) {
      eggCtx.status = 400;
      return { success: false, error: `Invalid paragraphIndex: ${paragraphIndex}, total paragraphs: ${paragraphs.length}` };
    }

    const paragraphText = paragraphs[paragraphIndex];
    const annotationType = type as 'translation' | 'explanation';

    // 检查缓存
    const cached = await this.newsService.getAnnotationCache(eggCtx, id, paragraphIndex, annotationType);

    // SSE headers
    eggCtx.set('Content-Type', 'text/event-stream');
    eggCtx.set('Cache-Control', 'no-cache');
    eggCtx.set('Connection', 'keep-alive');
    eggCtx.set('X-Accel-Buffering', 'no');

    const stream = new PassThrough();
    eggCtx.body = stream;

    const writeSSE = (data: Record<string, unknown>) => {
      stream.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    writeSSE({ type: 'start' });

    if (cached) {
      // 从 DB 缓存返回
      writeSSE({ type: 'delta', content: cached });
      writeSSE({ type: 'done', cached: true });
      stream.end();
      return;
    }

    // AI 实时流式生成
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aiConfig: ProductAIConfig = (eggCtx.app.config as any).bizConfig?.productAi;
    if (!aiConfig) {
      writeSSE({ type: 'error', error: 'AI service not configured' });
      stream.end();
      return;
    }

    const annotator = new NewsAnnotatorService(aiConfig);
    const title = (article as Record<string, unknown>).title as string;
    let fullResult = '';

    try {
      const generator = annotationType === 'translation'
        ? annotator.streamTranslation(paragraphText, title)
        : annotator.streamExplanation(paragraphText, title);

      for await (const delta of generator) {
        fullResult += delta;
        writeSSE({ type: 'delta', content: delta });
      }

      // 写入 DB 缓存（后续用户直接读缓存）
      await this.newsService.saveAnnotationCache(eggCtx, id, paragraphIndex, annotationType, fullResult);
      writeSSE({ type: 'done', cached: false });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      writeSSE({ type: 'error', error: errorMessage });
    } finally {
      stream.end();
    }
  }
}
