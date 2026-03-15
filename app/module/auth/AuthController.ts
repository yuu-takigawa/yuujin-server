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

  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/register',
  })
  async register(
    @Context() ctx: EggContext,
    @HTTPBody() body: { email: string; password: string; name: string },
  ) {
    try {
      const result = await this.authService.register(ctx as unknown as EggCtx, body.email, body.password, body.name);
      return { success: true, data: result };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

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
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

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
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  }
}
