import {
  HTTPController,
  HTTPMethod,
  HTTPMethodEnum,
  Context,
  Inject,
} from '@eggjs/tegg';
import { EggContext } from '@eggjs/tegg';
import { Context as EggCtx } from 'egg';
import { RedeemService } from './RedeemService';

@HTTPController({
  path: '/',
})
export class RedeemController {
  @Inject()
  redeemService!: RedeemService;

  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/redeem',
  })
  async redeem(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const body = eggCtx.request.body as { code?: string };

    if (!body.code || !body.code.trim()) {
      eggCtx.status = 400;
      eggCtx.body = { success: false, error: '兑換コードを入力してください' };
      return;
    }

    try {
      const result = await this.redeemService.redeem(eggCtx, userId, body.code);
      eggCtx.body = { success: true, data: result };
    } catch (err: unknown) {
      eggCtx.status = 400;
      eggCtx.body = { success: false, error: (err as Error).message };
    }
  }
}
