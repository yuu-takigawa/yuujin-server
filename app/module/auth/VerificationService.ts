import { ContextProto, AccessLevel, Inject } from '@eggjs/tegg';
import { Context } from 'egg';
import * as crypto from 'crypto';
import { EmailService } from './EmailService';

function boneData(bone: Record<string, unknown>): Record<string, unknown> {
  if (typeof (bone as { getRaw?: Function }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone;
}

@ContextProto({
  accessLevel: AccessLevel.PUBLIC,
})
export class VerificationService {
  @Inject()
  emailService!: EmailService;

  /**
   * Generate a 6-digit verification code, store it, and send via email.
   */
  async generateAndSend(ctx: Context, email: string, type: 'register' | 'reset_password') {
    // Rate limit: 60s cooldown per email+type
    const recent = await (ctx.model as any).VerificationCode.findOne({
      email,
      codeType: type,
      createdAt: { $gte: new Date(Date.now() - 60_000) },
    });
    if (recent) {
      throw Object.assign(new Error('認証コードは60秒ごとに1回のみ送信可能です'), { code: 'RATE_LIMIT' });
    }

    // Hourly limit: max 10 per email
    const hourlyCount = await (ctx.model as any).VerificationCode.count({
      email,
      createdAt: { $gte: new Date(Date.now() - 3600_000) },
    });
    if (hourlyCount >= 10) {
      throw Object.assign(new Error('送信回数が上限に達しました。1時間後に再度お試しください'), { code: 'RATE_LIMIT' });
    }

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();

    // Store in DB
    await (ctx.model as any).VerificationCode.create({
      email,
      code,
      codeType: type,
      expiresAt: new Date(Date.now() + 10 * 60_000), // 10 minutes
    });

    // Send email
    await this.emailService.sendVerificationCode(ctx, email, code, type);

    // Cleanup old codes for this email (older than 24h)
    await (ctx.model as any).VerificationCode.remove({
      email,
      createdAt: { $lt: new Date(Date.now() - 86400_000) },
    });
  }

  /**
   * Verify a code and mark it as used.
   * Returns true if valid, throws on failure.
   */
  async verify(ctx: Context, email: string, code: string, type: 'register' | 'reset_password'): Promise<boolean> {
    // Find the latest unused, unexpired code
    const record = await (ctx.model as any).VerificationCode.findOne({
      email,
      type,
      used: 0,
      expiresAt: { $gte: new Date() },
    }).order('id DESC');

    if (!record) {
      throw new Error('認証コードが無効または期限切れです');
    }

    const data = boneData(record as Record<string, unknown>);

    // Increment attempts
    const attempts = ((data.attempts as number) || 0) + 1;
    await (ctx.model as any).VerificationCode.update({ id: data.id }, { attempts });

    // Too many attempts
    if (attempts > 5) {
      await (ctx.model as any).VerificationCode.update({ id: data.id }, { used: 1 });
      throw new Error('試行回数が上限に達しました。新しいコードを取得してください');
    }

    // Check code match
    if (data.code !== code) {
      throw new Error('認証コードが正しくありません');
    }

    // Mark as used
    await (ctx.model as any).VerificationCode.update({ id: data.id }, { used: 1 });

    return true;
  }
}
