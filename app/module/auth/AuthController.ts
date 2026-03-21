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

  /** POST /auth/send-code — 发送邮箱验证码（无需认证） */
  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/send-code',
  })
  async sendCode(
    @Context() ctx: EggContext,
    @HTTPBody() body: { email: string; type: 'register' | 'reset_password' },
  ) {
    const eggCtx = ctx as unknown as EggCtx;
    try {
      const { email, type } = body;
      if (!email || !type) {
        eggCtx.status = 400;
        return { success: false, error: 'email and type are required' };
      }
      if (!['register', 'reset_password'].includes(type)) {
        eggCtx.status = 400;
        return { success: false, error: 'type must be register or reset_password' };
      }

      // Check email existence based on type
      const existing = await eggCtx.model.User.findOne({ email });
      if (type === 'register' && existing) {
        return { success: false, error: 'このメールアドレスは既に登録されています' };
      }
      if (type === 'reset_password' && !existing) {
        return { success: false, error: 'このメールアドレスは登録されていません' };
      }

      await this.verificationService.generateAndSend(eggCtx, email, type);
      return { success: true };
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      if (error.code === 'RATE_LIMIT') {
        eggCtx.status = 429;
      }
      return { success: false, error: error.message };
    }
  }

  /** POST /auth/verify-code — 校验验证码（无需认证，前端预校验用） */
  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/verify-code',
  })
  async verifyCode(
    @Context() ctx: EggContext,
    @HTTPBody() body: { email: string; code: string; type: 'register' | 'reset_password' },
  ) {
    try {
      // Note: this does NOT mark code as used (peek only)
      const eggCtx = ctx as unknown as EggCtx;
      const { email, code, type } = body;
      if (!email || !code || !type) {
        return { success: false, error: 'email, code, and type are required' };
      }
      await this.verificationService.verify(eggCtx, email, code, type);
      return { success: true, valid: true };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  }

  /** POST /auth/register — 注册（需验证码） */
  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/register',
  })
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

  /** POST /auth/login — 邮箱密码登录 */
  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/login',
  })
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

  /** POST /auth/reset-password — 验证码重置密码（无需认证） */
  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/reset-password',
  })
  async resetPassword(
    @Context() ctx: EggContext,
    @HTTPBody() body: { email: string; code: string; newPassword: string },
  ) {
    try {
      const eggCtx = ctx as unknown as EggCtx;
      const { email, code, newPassword } = body;
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

  /** POST /auth/change-password — 已登录用户改密码（需认证） */
  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/change-password',
  })
  async changePassword(
    @Context() ctx: EggContext,
    @HTTPBody() body: { currentPassword: string; newPassword: string },
  ) {
    try {
      const eggCtx = ctx as unknown as EggCtx;
      const userId = (eggCtx as Record<string, unknown>).userId as string;
      const { currentPassword, newPassword } = body;
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

  /** POST /auth/refresh — 刷新 token */
  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/refresh',
  })
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
