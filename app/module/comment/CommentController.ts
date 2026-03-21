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
import { v4 as uuidv4 } from 'uuid';
import { CommentService } from './CommentService';
import { streamProductAIChat, ProductAIConfig } from '../ai/ProductAIService';
import { buildSystemPrompt } from '../conversation/lib/prompt-loader';
import { COMMENT_REPLY_TASK, buildCommentReplyUserPrompt } from 'yuujin-prompts';

function boneData(bone: unknown): Record<string, unknown> {
  if (bone && typeof (bone as { getRaw?: () => Record<string, unknown> }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone as Record<string, unknown>;
}

@HTTPController({
  path: '/news',
})
export class CommentController {
  @Inject()
  commentService!: CommentService;

  /** GET /news/:id/comments — 只返回当前用户 + 其AI角色的评论 */
  @HTTPMethod({ method: HTTPMethodEnum.GET, path: '/:id/comments' })
  async list(@Context() ctx: EggContext, @HTTPParam() id: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const comments = await this.commentService.list(eggCtx, id, userId);
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

  /** POST /news/:id/comments/ai-reply  body: { commentId, characterId }
   *  SSE 流式返回 AI 角色的回复 */
  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/:id/comments/ai-reply' })
  async aiReply(@Context() ctx: EggContext, @HTTPParam() id: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const body = eggCtx.request.body as { commentId?: string; characterId?: string };

    if (!body.commentId || !body.characterId) {
      eggCtx.status = 400;
      return { success: false, error: 'commentId and characterId are required' };
    }

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

    try {
      const userId = (eggCtx as Record<string, unknown>).userId as string;

      // 加载文章、角色、用户评论、好友关系（获取 soul/memory）、用户信息（获取 jpLevel）
      const [articleRow, charRow, commentRow, friendshipRow, userRow] = await Promise.all([
        eggCtx.model.News.findOne({ id }),
        eggCtx.model.Character.findOne({ id: body.characterId }),
        eggCtx.model.NewsComment.findOne({ id: body.commentId }),
        eggCtx.model.Friendship.findOne({ userId, characterId: body.characterId }),
        eggCtx.model.User.findOne({ id: userId }),
      ]);

      if (!articleRow || !charRow || !commentRow) {
        writeSSE({ type: 'error', error: 'Article, character, or comment not found' });
        stream.end();
        return;
      }

      const article = boneData(articleRow);
      const character = boneData(charRow);
      const userComment = boneData(commentRow);
      const friendship = friendshipRow ? boneData(friendshipRow) : null;
      const user = userRow ? boneData(userRow) : null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aiConfig: ProductAIConfig = (eggCtx.app.config as any).bizConfig?.productAi;
      if (!aiConfig) {
        writeSSE({ type: 'error', error: 'AI service not configured' });
        stream.end();
        return;
      }

      const replyId = uuidv4();

      writeSSE({
        type: 'start',
        commentId: replyId,
        character: {
          id: character.id,
          name: character.name,
          avatarEmoji: character.avatarEmoji || character.avatar_emoji || '🤖',
        },
      });

      // 构建带 soul/memory 的 system prompt（与对话系统一致）
      const soul = (friendship?.soul as string) || (character.initialSoul as string) || (character.initial_soul as string) || '';
      const memory = (friendship?.memory as string) || null;
      const jpLevel = (user?.jpLevel as string) || (user?.jp_level as string) || undefined;

      const basePrompt = buildSystemPrompt({ soul, memory, userLevel: jpLevel });
      const systemPrompt = `${basePrompt}${COMMENT_REPLY_TASK}`;

      // 收集文章内容摘要 + 评论区上下文
      const articleContent = (article.content as string || '').slice(0, 500);
      const existingComments = await eggCtx.model.NewsComment.find({ newsId: id }).order('created_at ASC').limit(20);
      const commentContext = (existingComments as unknown[]).map(boneData)
        .map((c) => `${c.isAi ? '(AI)' : '(User)'}: ${(c.content as string).slice(0, 100)}`)
        .join('\n');

      const userPrompt = buildCommentReplyUserPrompt(
        article.title as string,
        articleContent,
        commentContext,
        userComment.content as string,
      );

      let fullContent = '';
      const generator = streamProductAIChat(
        aiConfig,
        [{ role: 'user', content: userPrompt }],
        systemPrompt,
      );

      for await (const delta of generator) {
        fullContent += delta;
        writeSSE({ type: 'delta', content: delta });
      }

      // 保存 AI 回复到 DB
      await eggCtx.model.NewsComment.create({
        id: replyId,
        newsId: id,
        characterId: body.characterId,
        parentId: body.commentId,
        content: fullContent.trim().slice(0, 500),
        isAi: 1,
      });

      writeSSE({ type: 'done', commentId: replyId });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      eggCtx.logger.warn('[AIReply] Failed:', errorMessage);
      writeSSE({ type: 'error', error: errorMessage });
    } finally {
      stream.end();
    }
  }

  /** DELETE /news/:newsId/comments/:commentId */
  @HTTPMethod({ method: HTTPMethodEnum.DELETE, path: '/:newsId/comments/:commentId' })
  async delete(@Context() ctx: EggContext, @HTTPParam() newsId: string, @HTTPParam() commentId: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    void newsId;
    const deleted = await this.commentService.delete(eggCtx, commentId, userId);
    if (!deleted) {
      eggCtx.status = 404;
      return { success: false, error: 'Comment not found or not yours' };
    }
    return { success: true };
  }
}
