import { Context } from 'egg';
import { verifyToken } from '../module/auth/lib/jwt';

const PUBLIC_PATHS = ['/auth/register', '/auth/login', '/auth/refresh', '/auth/send-code', '/auth/verify-code', '/auth/reset-password'];

export default function authMiddleware(): (ctx: Context, next: () => Promise<void>) => Promise<void> {
  return async function auth(ctx: Context, next: () => Promise<void>) {
    const { path } = ctx;

    // Skip auth for public paths
    if (PUBLIC_PATHS.some(p => path.startsWith(p))) {
      await next();
      return;
    }

    const authorization = ctx.get('authorization');
    if (!authorization || !authorization.startsWith('Bearer ')) {
      ctx.status = 401;
      ctx.body = { error: 'Missing or invalid authorization header' };
      return;
    }

    const token = authorization.slice(7);
    try {
      const jwtConfig = (ctx.app.config as any).bizConfig.jwt;
      const payload = verifyToken(token, jwtConfig.secret);
      (ctx as any).userId = payload.userId;
      (ctx as any).userEmail = payload.email;
    } catch (err) {
      ctx.status = 401;
      ctx.body = { error: 'Invalid or expired token' };
      return;
    }

    await next();
  };
}
