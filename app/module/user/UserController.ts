import {
  HTTPController,
  HTTPMethod,
  HTTPMethodEnum,
  Context,
} from '@eggjs/tegg';
import { EggContext } from '@eggjs/tegg';
import { Context as EggCtx } from 'egg';

function boneData(bone: Record<string, unknown>): Record<string, unknown> {
  if (typeof (bone as { getRaw?: Function }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone;
}

@HTTPController({
  path: '/users',
})
export class UserController {
  @HTTPMethod({
    method: HTTPMethodEnum.GET,
    path: '/me',
  })
  async me(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const user = await eggCtx.model.User.findOne({ id: userId });

    if (!user) {
      eggCtx.status = 404;
      return { success: false, error: 'User not found' };
    }

    const data = boneData(user);
    return {
      success: true,
      data: {
        id: data.id,
        email: data.email,
        name: data.name,
        avatarUrl: data.avatarUrl,
        avatarEmoji: data.avatarEmoji || '👤',
        jpLevel: data.jpLevel,
        membership: data.membership,
        settings: data.settings,
        createdAt: data.createdAt,
      },
    };
  }

  @HTTPMethod({
    method: HTTPMethodEnum.PUT,
    path: '/me',
  })
  async update(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const body = eggCtx.request.body as Record<string, unknown>;

    const user = await eggCtx.model.User.findOne({ id: userId });
    if (!user) {
      eggCtx.status = 404;
      return { success: false, error: 'User not found' };
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.avatarUrl !== undefined) updates.avatarUrl = body.avatarUrl;
    if (body.avatarEmoji !== undefined) updates.avatarEmoji = body.avatarEmoji;
    if (body.jpLevel !== undefined) updates.jpLevel = body.jpLevel;
    if (body.settings !== undefined) {
      const existingSettings = (boneData(user).settings as Record<string, unknown>) || {};
      updates.settings = { ...existingSettings, ...(body.settings as Record<string, unknown>) };
    }

    if (Object.keys(updates).length === 0) {
      eggCtx.status = 400;
      return { success: false, error: 'No valid fields to update' };
    }

    await eggCtx.model.User.update({ id: userId }, updates);
    const updated = await eggCtx.model.User.findOne({ id: userId });
    const data = boneData(updated!);

    return {
      success: true,
      data: {
        id: data.id,
        email: data.email,
        name: data.name,
        avatarUrl: data.avatarUrl,
        avatarEmoji: data.avatarEmoji || '👤',
        jpLevel: data.jpLevel,
        membership: data.membership,
        settings: data.settings,
        createdAt: data.createdAt,
      },
    };
  }
}
