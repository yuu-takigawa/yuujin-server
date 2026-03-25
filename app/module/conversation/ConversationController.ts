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
import { ConversationService } from './ConversationService';

@HTTPController({
  path: '/conversations',
})
export class ConversationController {
  @Inject()
  conversationService!: ConversationService;

  @HTTPMethod({
    method: HTTPMethodEnum.GET,
    path: '/',
  })
  async list(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const conversations = await this.conversationService.list(eggCtx, userId);
    return { success: true, data: conversations };
  }

  @HTTPMethod({
    method: HTTPMethodEnum.GET,
    path: '/:id',
  })
  async get(@Context() ctx: EggContext, @HTTPParam() id: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const conversation = await this.conversationService.getById(eggCtx, id, userId);
    if (!conversation) {
      eggCtx.status = 404;
      return { success: false, error: 'Conversation not found' };
    }

    const query = (eggCtx.query || {}) as Record<string, string>;
    const limit = query.limit ? parseInt(query.limit, 10) : 30;
    const before = query.before || undefined;
    const { messages, hasMore } = await this.conversationService.getMessages(eggCtx, id, limit, before);
    return { success: true, data: { conversation, messages, hasMore } };
  }

  @HTTPMethod({
    method: HTTPMethodEnum.DELETE,
    path: '/:id',
  })
  async delete(@Context() ctx: EggContext, @HTTPParam() id: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const deleted = await this.conversationService.delete(eggCtx, id, userId);
    if (!deleted) {
      eggCtx.status = 404;
      return { success: false, error: 'Conversation not found' };
    }
    return { success: true };
  }

  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/:id/read',
  })
  async markAsRead(@Context() ctx: EggContext, @HTTPParam() id: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const success = await this.conversationService.markAsRead(eggCtx, id, userId);
    if (!success) {
      eggCtx.status = 404;
      return { success: false, error: 'Conversation not found' };
    }
    return { success: true };
  }

  @HTTPMethod({
    method: HTTPMethodEnum.DELETE,
    path: '/:id/messages',
  })
  async clearMessages(@Context() ctx: EggContext, @HTTPParam() id: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const success = await this.conversationService.clearMessages(eggCtx, id, userId);
    if (!success) {
      eggCtx.status = 404;
      return { success: false, error: 'Conversation not found' };
    }
    return { success: true };
  }

  @HTTPMethod({
    method: HTTPMethodEnum.GET,
    path: '/:id/search',
  })
  async search(@Context() ctx: EggContext, @HTTPParam() id: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const keyword = (eggCtx.query as Record<string, string>).keyword || '';

    if (!keyword) {
      eggCtx.status = 400;
      return { success: false, error: 'keyword is required' };
    }

    const messages = await this.conversationService.search(eggCtx, id, userId, keyword);
    if (messages === null) {
      eggCtx.status = 404;
      return { success: false, error: 'Conversation not found' };
    }
    return { success: true, data: messages };
  }
}
