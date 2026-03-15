import { ContextProto, AccessLevel } from '@eggjs/tegg';
import { Context } from 'egg';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { signToken, JwtPayload } from './lib/jwt';

// Helper to extract attributes from a Leoric Bone instance
// TypeScript class fields shadow Leoric's prototype getters, so we use getRaw()
function boneData(bone: Record<string, unknown>): Record<string, unknown> {
  if (typeof (bone as { getRaw?: Function }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone;
}

@ContextProto({
  accessLevel: AccessLevel.PUBLIC,
})
export class AuthService {
  async register(ctx: Context, email: string, password: string, name: string) {
    const jwtConfig = ctx.app.config.bizConfig.jwt;

    const existing = await ctx.model.User.findOne({ email });
    if (existing) {
      throw new Error('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = uuidv4();

    const avatarEmoji = '👤';
    await ctx.model.User.create({
      id,
      email,
      passwordHash,
      name,
      avatarEmoji,
      settings: { defaultModelId: 'model-ernie-speed' },
    });

    const payload: JwtPayload = { userId: id, email };
    const token = signToken(payload, jwtConfig.secret, jwtConfig.expiresIn);
    const refreshToken = signToken(payload, jwtConfig.secret, jwtConfig.refreshExpiresIn);

    return {
      user: { id, email, name, avatarEmoji },
      token,
      refreshToken,
    };
  }

  async login(ctx: Context, email: string, password: string) {
    const jwtConfig = ctx.app.config.bizConfig.jwt;

    const user = await ctx.model.User.findOne({ email });
    if (!user) {
      throw new Error('Invalid email or password');
    }

    const data = boneData(user);
    const valid = await bcrypt.compare(password, data.passwordHash as string);
    if (!valid) {
      throw new Error('Invalid email or password');
    }

    const payload: JwtPayload = { userId: data.id as string, email: data.email as string };
    const token = signToken(payload, jwtConfig.secret, jwtConfig.expiresIn);
    const refreshToken = signToken(payload, jwtConfig.secret, jwtConfig.refreshExpiresIn);

    return {
      user: { id: data.id, email: data.email, name: data.name, avatarEmoji: data.avatarEmoji || '👤' },
      token,
      refreshToken,
    };
  }

  async refresh(ctx: Context, refreshToken: string) {
    const jwtConfig = ctx.app.config.bizConfig.jwt;
    const { verifyToken } = require('./lib/jwt');
    const payload = verifyToken(refreshToken, jwtConfig.secret) as JwtPayload;

    const newToken = signToken(
      { userId: payload.userId, email: payload.email },
      jwtConfig.secret,
      jwtConfig.expiresIn,
    );

    return { token: newToken };
  }
}
