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
      difficulty: query.difficulty,
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

}
