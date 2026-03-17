import { ContextProto, AccessLevel } from '@eggjs/tegg';
import { Context } from 'egg';

function boneData(bone: unknown): Record<string, unknown> {
  if (bone && typeof (bone as { getRaw?: () => Record<string, unknown> }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone as Record<string, unknown>;
}

@ContextProto({
  accessLevel: AccessLevel.PUBLIC,
})
export class NotificationService {
  /** 获取用户通知列表（最近 50 条，未读优先） */
  async list(ctx: Context, userId: string) {
    const rows = await ctx.model.Notification.find({ userId })
      .order('is_read ASC, created_at DESC')
      .limit(50);
    return (rows as unknown[]).map(boneData);
  }

  /** 未读通知数量（用于 bell icon 角标） */
  async unreadCount(ctx: Context, userId: string): Promise<number> {
    const rows = await ctx.model.Notification.find({ userId, isRead: 0 });
    return (rows as unknown[]).length;
  }

  /** 全部标为已读 */
  async markAllRead(ctx: Context, userId: string) {
    await ctx.model.Notification.update({ userId, isRead: 0 }, { isRead: 1 });
  }
}
