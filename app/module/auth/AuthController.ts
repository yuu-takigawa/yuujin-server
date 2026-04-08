import {
  HTTPController,
  HTTPMethod,
  HTTPMethodEnum,
  HTTPBody,
  Context,
  Inject,
} from '@eggjs/tegg';
import { EggContext } from '@eggjs/tegg';
import { Context as EggCtx } from 'egg';
import { AuthService } from './AuthService';
import { RedeemService } from '../redeem/RedeemService';

@HTTPController({
  path: '/auth',
})
export class AuthController {
  @Inject()
  authService!: AuthService;

  @Inject()
  redeemService!: RedeemService;

  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/register' })
  async register(
    @Context() ctx: EggContext,
    @HTTPBody() body: { email: string; password: string; name: string; code: string; inviteCode?: string },
  ) {
    try {
      const eggCtx = ctx as unknown as EggCtx;

      const result = await this.authService.register(
        eggCtx,
        body.email,
        body.password,
        body.name,
        body.code,
      );

      // After successful registration, redeem code if provided
      let redeemWarning: string | undefined;
      if (body.inviteCode?.trim()) {
        try {
          await this.redeemService.redeem(eggCtx, result.user.id, body.inviteCode.trim());
        } catch (err: unknown) {
          redeemWarning = (err as Error).message;
        }
      }

      return { success: true, data: result, redeemWarning };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  }

  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/login' })
  async login(
    @Context() ctx: EggContext,
    @HTTPBody() body: { email: string; password: string },
  ) {
    try {
      const result = await this.authService.login(ctx as unknown as EggCtx, body.email, body.password);
      return { success: true, data: result };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  }

  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/refresh' })
  async refresh(
    @Context() ctx: EggContext,
    @HTTPBody() body: { refreshToken: string },
  ) {
    try {
      const result = await this.authService.refresh(ctx as unknown as EggCtx, body.refreshToken);
      return { success: true, data: result };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  }
}
