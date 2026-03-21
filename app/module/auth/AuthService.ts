import { ContextProto, AccessLevel, Inject } from '@eggjs/tegg';
import { Context } from 'egg';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { signToken, JwtPayload } from './lib/jwt';
import { VerificationService } from './VerificationService';

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
  @Inject()
  verificationService!: VerificationService;

  async register(ctx: Context, email: string, password: string, name: string, code?: string) {
    const jwtConfig = ctx.app.config.bizConfig.jwt;

    // Verify email code (required)
    if (!code) {
      throw new Error('認証コードを入力してください');
    }
    await this.verificationService.verify(ctx, email, code, 'register');

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
      throw new Error('メールアドレスまたはパスワードが間違っています');
    }

    const data = boneData(user);
    const valid = await bcrypt.compare(password, data.passwordHash as string);
    if (!valid) {
      throw new Error('メールアドレスまたはパスワードが間違っています');
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

  async resetPassword(ctx: Context, email: string, code: string, newPassword: string) {
    // Verify code
    await this.verificationService.verify(ctx, email, code, 'reset_password');

    // Update password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const user = await ctx.model.User.findOne({ email });
    if (!user) {
      throw new Error('ユーザーが見つかりません');
    }
    await ctx.model.User.update({ email }, { passwordHash });
  }

  async changePassword(ctx: Context, userId: string, currentPassword: string, newPassword: string) {
    const user = await ctx.model.User.findOne({ id: userId });
    if (!user) {
      throw new Error('ユーザーが見つかりません');
    }

    const data = boneData(user);
    const valid = await bcrypt.compare(currentPassword, data.passwordHash as string);
    if (!valid) {
      throw new Error('現在のパスワードが正しくありません');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await ctx.model.User.update({ id: userId }, { passwordHash });
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
