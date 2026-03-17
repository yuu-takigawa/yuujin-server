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
import { CommentService } from './CommentService';

@HTTPController({
  path: '/news',
})
export class CommentController {
  @Inject()
  commentService!: CommentService;

  /** GET /news/:id/comments */
  @HTTPMethod({ method: HTTPMethodEnum.GET, path: '/:id/comments' })
  async list(@Context() ctx: EggContext, @HTTPParam() id: string) {
    const comments = await this.commentService.list(ctx as unknown as EggCtx, id);
    return { success: true, data: comments };
  }

  /** POST /news/:id/comments  body: { content, parentId? } */
  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/:id/comments' })
  async create(@Context() ctx: EggContext, @HTTPParam() id: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const body = eggCtx.request.body as { content?: string; parentId?: string };

    if (!body.content?.trim()) {
      eggCtx.status = 400;
      return { success: false, error: 'content is required' };
    }

    try {
      const comment = await this.commentService.create(eggCtx, userId, {
        newsId: id,
        content: body.content.trim(),
        parentId: body.parentId,
      });
      return { success: true, data: comment };
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'NOT_FOUND') {
        eggCtx.status = 404;
        return { success: false, error: 'News not found' };
      }
      eggCtx.status = 500;
      return { success: false, error: e.message };
    }
  }

  /** DELETE /news/:newsId/comments/:commentId */
  @HTTPMethod({ method: HTTPMethodEnum.DELETE, path: '/:newsId/comments/:commentId' })
  async delete(@Context() ctx: EggContext, @HTTPParam() newsId: string, @HTTPParam() commentId: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    void newsId; // newsId 暂时不需要额外验证，CommentService 内已校验 ownership
    const deleted = await this.commentService.delete(eggCtx, commentId, userId);
    if (!deleted) {
      eggCtx.status = 404;
      return { success: false, error: 'Comment not found or not yours' };
    }
    return { success: true };
  }
}
