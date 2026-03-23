import { ContextProto, AccessLevel } from '@eggjs/tegg';
import { Context } from 'egg';
import { v4 as uuidv4 } from 'uuid';

function boneData(bone: unknown): Record<string, unknown> {
  if (bone && typeof (bone as { getRaw?: () => Record<string, unknown> }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone as Record<string, unknown>;
}

/** @mention 解析：从评论文本提取 @角色名 或 @用户名 */
function parseMentions(content: string): string[] {
  const matches = content.match(/@([^\s@,，。！？!?]+)/g) || [];
  return matches.map((m) => m.slice(1)); // 去掉 @
}

export interface CreateCommentInput {
  newsId: string;
  content: string;
  parentId?: string;
}

@ContextProto({
  accessLevel: AccessLevel.PUBLIC,
})
export class CommentService {
  /** 获取某篇文章的评论列表 — 只返回该用户的"后花园"：自己的评论 + AI对自己的回复 + AI公共评论 */
  async list(ctx: Context, newsId: string, userId?: string) {
    const allComments = await ctx.model.NewsComment.find({ newsId }).order('created_at ASC');

    let comments = (allComments as unknown[]).map(boneData);

    // 过滤：只保留当前用户的"后花园"
    if (userId) {
      // 先收集该用户自己发的评论 ID
      const ownCommentIds = new Set(
        comments.filter((c) => c.userId === userId).map((c) => c.id as string),
      );
      // 收集用户回复过的一级评论 parentId（用户参与的对话线程）
      const ownParentIds = new Set(
        comments.filter((c) => c.userId === userId && c.parentId).map((c) => c.parentId as string),
      );
      comments = comments.filter((c) => {
        // 用户自己的评论
        if (c.userId === userId) return true;
        // AI 公共评论（cron 生成，没有 parentId）
        if (c.isAi && !c.parentId) return true;
        // AI 对该用户评论的回复
        if (c.isAi && c.parentId && ownCommentIds.has(c.parentId as string)) return true;
        // AI 回复在用户参与的同一对话线程中
        if (c.isAi && c.parentId && ownParentIds.has(c.parentId as string)) return true;
        return false;
      });
    }

    // 获取所有 userId 和 characterId 以批量查询用户/角色信息
    const userIds = [...new Set(comments.map((c) => c.userId as string).filter(Boolean))];
    const charIds = [...new Set(comments.map((c) => c.characterId as string).filter(Boolean))];

    const [users, chars] = await Promise.all([
      userIds.length > 0 ? ctx.model.User.find({ id: userIds }) : [],
      charIds.length > 0 ? ctx.model.Character.find({ id: charIds }) : [],
    ]);

    const userMap = new Map((users as unknown[]).map(boneData).map((u) => [u.id, u]));
    const charMap = new Map((chars as unknown[]).map(boneData).map((c) => [c.id, c]));

    // 构建带作者信息的评论
    const enriched = comments.map((c) => {
      const author = c.isAi
        ? charMap.get(c.characterId as string)
        : userMap.get(c.userId as string);
      return {
        ...c,
        author: author
          ? {
            id: author.id,
            name: author.name,
            avatarUrl: (author as Record<string, unknown>).avatarUrl || (author as Record<string, unknown>).avatar_url || '',
            avatarEmoji: (author as Record<string, unknown>).avatarEmoji || (author as Record<string, unknown>).avatar_emoji || '👤',
            isAi: Boolean(c.isAi),
          }
          : null,
      };
    });

    // 按两层结构组织：top-level + replies
    type EnrichedComment = Record<string, unknown> & { author: unknown };
    const enrichedTyped = enriched as EnrichedComment[];
    const top = enrichedTyped.filter((c) => !c.parentId);
    const replyMap = new Map<string, EnrichedComment[]>();
    for (const c of enrichedTyped.filter((c) => c.parentId)) {
      const pid = c.parentId as string;
      if (!replyMap.has(pid)) replyMap.set(pid, []);
      replyMap.get(pid)!.push(c);
    }

    return top.map((c) => ({
      ...c,
      replies: replyMap.get(c.id as string) || [],
    }));
  }

  /** 用户发表评论 */
  async create(ctx: Context, userId: string, input: CreateCommentInput) {
    const { newsId, content, parentId } = input;

    // 验证文章存在
    const article = await ctx.model.News.findOne({ id: newsId });
    if (!article) throw Object.assign(new Error('News not found'), { code: 'NOT_FOUND' });

    const id = uuidv4();
    const mentionNames = parseMentions(content);

    // 查找被 @ 的角色
    const mentions: Array<{ type: string; id: string; name: string }> = [];
    for (const name of mentionNames) {
      const char = await ctx.model.Character.findOne({ name });
      if (char) {
        const c = boneData(char);
        mentions.push({ type: 'character', id: c.id as string, name: c.name as string });
      }
    }

    await ctx.model.NewsComment.create({
      id,
      newsId,
      userId,
      parentId: parentId || null,
      content,
      mentions: mentions.length > 0 ? mentions : null,
      isAi: 0,
    });

    // 如果是回复，通知被回复者
    if (parentId) {
      const parent = await ctx.model.NewsComment.findOne({ id: parentId });
      if (parent) {
        const parentData = boneData(parent);
        const recipientUserId = parentData.userId as string | null;
        if (recipientUserId && recipientUserId !== userId) {
          await ctx.model.Notification.create({
            id: uuidv4(),
            userId: recipientUserId,
            type: 'reply',
            entityType: 'news_comment',
            entityId: id,
            fromUserId: userId,
          });
        }
      }
    }

    // 处理 @提及 通知（只对 AI 角色绑定的真实用户发通知，目前简化跳过）

    return { id, newsId, userId, content, parentId, mentions };
  }

  /** 删除评论（只能删自己的） */
  async delete(ctx: Context, id: string, userId: string) {
    const comment = await ctx.model.NewsComment.findOne({ id, userId, isAi: 0 });
    if (!comment) return false;
    await ctx.model.NewsComment.remove({ id });
    // 同时删除回复
    await ctx.model.NewsComment.remove({ parentId: id });
    return true;
  }
}
