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

  /** POST /subscriptions/upgrade  body: { tier: 'pro'|'max' } */
  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/subscriptions/upgrade',
  })
  async upgrade(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const body = eggCtx.request.body as { tier?: string };

    const VALID_TIERS = ['pro', 'max'];
    if (!body.tier || !VALID_TIERS.includes(body.tier)) {
      eggCtx.status = 400;
      eggCtx.body = { success: false, error: 'tier must be pro or max' };
      return;
    }

    // Beta: Max tier not available yet
    if (body.tier === 'max') {
      eggCtx.status = 400;
      eggCtx.body = { success: false, error: 'このプランは近日公開予定です' };
      return;
    }

    try {
      const result = await this.creditService.upgradeMembership(eggCtx, userId, body.tier);
      eggCtx.body = { success: true, data: result };
    } catch (err: unknown) {
      eggCtx.status = 500;
      eggCtx.body = { success: false, error: (err as Error).message };
    }
  }
}
