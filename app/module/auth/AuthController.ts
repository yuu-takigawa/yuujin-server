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
import { VerificationService } from './VerificationService';

@HTTPController({
  path: '/auth',
})
export class AuthController {
  @Inject()
  authService!: AuthService;

  @Inject()
  verificationService!: VerificationService;

  /** POST /auth/send-code */
  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/send-code' })
  async sendCode(
    @Context() ctx: EggContext,
    @HTTPBody() body: { email: string; type: string },
  ) {
    const eggCtx = ctx as unknown as EggCtx;
    const b = body || (eggCtx as any).request?.body || {};
    try {
      const { email, type } = b;
      if (!email || !type) {
        eggCtx.status = 400;
        return { success: false, error: 'email and type are required' };
      }
      if (!['register', 'reset_password'].includes(type)) {
        eggCtx.status = 400;
        return { success: false, error: 'type must be register or reset_password' };
      }

      const existing = await eggCtx.model.User.findOne({ email });
      if (type === 'register' && existing) {
        return { success: false, error: 'このメールアドレスは既に登録されています' };
      }
      if (type === 'reset_password' && !existing) {
        return { success: false, error: 'このメールアドレスは登録されていません' };
      }

      await this.verificationService.generateAndSend(eggCtx, email, type as 'register' | 'reset_password');
      return { success: true };
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      if (error.code === 'RATE_LIMIT') {
        eggCtx.status = 429;
      }
      return { success: false, error: error.message };
    }
  }

  /** POST /auth/verify-code */
  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/verify-code' })
  async verifyCode(
    @Context() ctx: EggContext,
    @HTTPBody() body: { email: string; code: string; type: string },
  ) {
    const eggCtx = ctx as unknown as EggCtx;
    const b = body || (eggCtx as any).request?.body || {};
    try {
      const { email, code, type } = b;
      if (!email || !code || !type) {
        return { success: false, error: 'email, code, and type are required' };
      }
      await this.verificationService.verify(eggCtx, email, code, type as 'register' | 'reset_password');
      return { success: true, valid: true };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  }

  /** POST /auth/register */
  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/register' })
  async register(
    @Context() ctx: EggContext,
    @HTTPBody() body: { email: string; password: string; name: string; code: string },
  ) {
    try {
      const result = await this.authService.register(
        ctx as unknown as EggCtx,
        body.email,
        body.password,
        body.name,
        body.code,
      );
      return { success: true, data: result };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  }

  /** POST /auth/login */
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

  /** POST /auth/reset-password */
  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/reset-password' })
  async resetPassword(
    @Context() ctx: EggContext,
    @HTTPBody() body: { email: string; code: string; newPassword: string },
  ) {
    const eggCtx = ctx as unknown as EggCtx;
    const b = body || (eggCtx as any).request?.body || {};
    try {
      const { email, code, newPassword } = b;
      if (!email || !code || !newPassword) {
        return { success: false, error: 'email, code, and newPassword are required' };
      }
      if (newPassword.length < 6) {
        return { success: false, error: 'パスワードは6文字以上で入力してください' };
      }
      await this.authService.resetPassword(eggCtx, email, code, newPassword);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  }

  /** POST /auth/change-password */
  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/change-password' })
  async changePassword(
    @Context() ctx: EggContext,
    @HTTPBody() body: { currentPassword: string; newPassword: string },
  ) {
    const eggCtx = ctx as unknown as EggCtx;
    const b = body || (eggCtx as any).request?.body || {};
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    try {
      const { currentPassword, newPassword } = b;
      if (!currentPassword || !newPassword) {
        return { success: false, error: 'currentPassword and newPassword are required' };
      }
      if (newPassword.length < 6) {
        return { success: false, error: 'パスワードは6文字以上で入力してください' };
      }
      await this.authService.changePassword(eggCtx, userId, currentPassword, newPassword);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  }

  /** POST /auth/refresh */
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
