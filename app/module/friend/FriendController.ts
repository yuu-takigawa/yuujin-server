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
import { FriendService } from './FriendService';

@HTTPController({
  path: '/friends',
})
export class FriendController {
  @Inject()
  friendService!: FriendService;

  @HTTPMethod({
    method: HTTPMethodEnum.GET,
    path: '/',
  })
  async list(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const friends = await this.friendService.list(eggCtx, userId);
    return { success: true, data: friends };
  }

  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/',
  })
  async add(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const body = eggCtx.request.body as { characterId?: string };

    if (!body.characterId) {
      eggCtx.status = 400;
      return { success: false, error: 'characterId is required' };
    }

    try {
      const result = await this.friendService.add(eggCtx, userId, body.characterId);
      return { success: true, data: result };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'Character not found') {
        eggCtx.status = 404;
      } else if (message === 'Already friends with this character') {
        eggCtx.status = 409;
      } else {
        eggCtx.status = 500;
      }
      return { success: false, error: message };
    }
  }

  @HTTPMethod({
    method: HTTPMethodEnum.DELETE,
    path: '/:characterId',
  })
  async remove(@Context() ctx: EggContext, @HTTPParam() characterId: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const deleted = await this.friendService.remove(eggCtx, userId, characterId);
    if (!deleted) {
      eggCtx.status = 404;
      return { success: false, error: 'Friendship not found' };
    }
    return { success: true };
  }

  @HTTPMethod({
    method: HTTPMethodEnum.PUT,
    path: '/:characterId',
  })
  async update(@Context() ctx: EggContext, @HTTPParam() characterId: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const body = eggCtx.request.body as { isPinned?: number; isMuted?: number };

    const updated = await this.friendService.update(eggCtx, userId, characterId, {
      isPinned: body.isPinned,
      isMuted: body.isMuted,
    });

    if (!updated) {
      eggCtx.status = 404;
      return { success: false, error: 'Friendship not found' };
    }
    return { success: true, data: updated };
  }
}
