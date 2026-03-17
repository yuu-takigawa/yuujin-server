import {
  HTTPController,
  HTTPMethod,
  HTTPMethodEnum,
  Inject,
  Context,
} from '@eggjs/tegg';
import { EggContext } from '@eggjs/tegg';
import { Context as EggCtx } from 'egg';
import { PushService } from './PushService';

@HTTPController({
  path: '/push',
})
export class PushController {
  @Inject()
  pushService!: PushService;

  /** POST /push/register  body: { token, platform? } */
  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/register' })
  async register(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const body = eggCtx.request.body as { token?: string; platform?: string };

    if (!body.token) {
      eggCtx.status = 400;
      return { success: false, error: 'token is required' };
    }

    const result = await this.pushService.register(eggCtx, userId, body.token, body.platform);
    return { success: true, data: result };
  }

  /** DELETE /push/unregister  body: { token } */
  @HTTPMethod({ method: HTTPMethodEnum.DELETE, path: '/unregister' })
  async unregister(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const body = eggCtx.request.body as { token?: string };

    if (!body.token) {
      eggCtx.status = 400;
      return { success: false, error: 'token is required' };
    }

    await this.pushService.unregister(eggCtx, userId, body.token);
    return { success: true };
  }
}
