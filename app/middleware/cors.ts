import { Context } from 'egg';

export default function corsMiddleware(): (ctx: Context, next: () => Promise<void>) => Promise<void> {
  return async function cors(ctx: Context, next: () => Promise<void>) {
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    ctx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    ctx.set('Access-Control-Max-Age', '86400');

    if (ctx.method === 'OPTIONS') {
      ctx.status = 204;
      return;
    }

    await next();
  };
}
