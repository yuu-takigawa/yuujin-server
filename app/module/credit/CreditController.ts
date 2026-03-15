import {
  HTTPController,
  HTTPMethod,
  HTTPMethodEnum,
  Inject,
  Context,
} from '@eggjs/tegg';
import { EggContext } from '@eggjs/tegg';
import { Context as EggCtx } from 'egg';
import { CreditService } from './CreditService';

@HTTPController({
  path: '/',
})
export class CreditController {
  @Inject()
  creditService!: CreditService;

  @HTTPMethod({
    method: HTTPMethodEnum.GET,
    path: '/credits',
  })
  async getCredits(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;

    try {
      const result = await this.creditService.getCredits(eggCtx, userId);
      eggCtx.body = { success: true, data: result };
    } catch (err: unknown) {
      eggCtx.status = 500;
      eggCtx.body = { success: false, error: (err as Error).message };
    }
  }

  @HTTPMethod({
    method: HTTPMethodEnum.GET,
    path: '/models',
  })
  async getModels(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;

    try {
      const models = await this.creditService.getModels(eggCtx, userId);
      eggCtx.body = { success: true, data: models };
    } catch (err: unknown) {
      eggCtx.status = 500;
      eggCtx.body = { success: false, error: (err as Error).message };
    }
  }
}
