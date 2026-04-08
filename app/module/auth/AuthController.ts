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

@HTTPController({
  path: '/auth',
})
export class AuthController {
  @Inject()
  authService!: AuthService;

  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/register' })
  async register(
    @Context() ctx: EggContext,
    @HTTPBody() body: { email: string; password: string; name: string; code: string; inviteCode?: string },
  ) {
    try {
      // Invite code validation (optional — invited users get free Pro upgrade)
      const eggCtx = ctx as unknown as EggCtx;
      const requiredInviteCode = (eggCtx.app.config as any).bizConfig?.inviteCode;
      let invited = false;
      if (body.inviteCode && requiredInviteCode) {
        if (body.inviteCode !== requiredInviteCode) {
          return { success: false, error: '招待コードが正しくありません' };
        }
        invited = true;
      }

      const result = await this.authService.register(
        eggCtx,
        body.email,
        body.password,
        body.name,
        body.code,
        invited,
      );
      return { success: true, data: result };
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
