import {
  HTTPController,
  HTTPMethod,
  HTTPMethodEnum,
  Inject,
  Context,
} from '@eggjs/tegg';
import { EggContext } from '@eggjs/tegg';
import { Context as EggCtx } from 'egg';
import { NotificationService } from './NotificationService';

@HTTPController({
  path: '/notifications',
})
export class NotificationController {
  @Inject()
  notificationService!: NotificationService;

  /** GET /notifications  — 当前用户的未读通知列表 */
  @HTTPMethod({ method: HTTPMethodEnum.GET, path: '/' })
  async list(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const data = await this.notificationService.list(eggCtx, userId);
    return { success: true, data };
  }

  /** GET /notifications/unread-count */
  @HTTPMethod({ method: HTTPMethodEnum.GET, path: '/unread-count' })
  async unreadCount(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const count = await this.notificationService.unreadCount(eggCtx, userId);
    return { success: true, data: { count } };
  }

  /** POST /notifications/read-all — 全部标为已读 */
  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/read-all' })
  async readAll(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    await this.notificationService.markAllRead(eggCtx, userId);
    return { success: true };
  }
}
