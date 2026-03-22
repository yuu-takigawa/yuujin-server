import { ContextProto, AccessLevel, Inject } from '@eggjs/tegg';
import { Context } from 'egg';
import * as crypto from 'crypto';
import { EmailService } from './EmailService';

@ContextProto({
  accessLevel: AccessLevel.PUBLIC,
})
export class VerificationService {
  @Inject()
  emailService!: EmailService;

  private db(ctx: Context) {
    return (ctx.model as any).VerificationCode;
  }

  async generateAndSend(ctx: Context, email: string, type: 'register' | 'reset_password') {
    const VC = this.db(ctx);

    // Rate limit: 60s cooldown
    const [recent] = await VC.find({
      email,
      codeType: type,
    }).where('created_at >= ?', new Date(Date.now() - 60_000)).limit(1);
    if (recent) {
      throw Object.assign(new Error('認証コードは60秒ごとに1回のみ送信可能です'), { code: 'RATE_LIMIT' });
    }

    // Hourly limit: max 10
    const hourlyCount = await VC.where({
      email,
    }).where('created_at >= ?', new Date(Date.now() - 3600_000)).count();
    if (hourlyCount >= 10) {
      throw Object.assign(new Error('送信回数が上限に達しました。1時間後に再度お試しください'), { code: 'RATE_LIMIT' });
    }

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();

    // Store
    await VC.create({
      email,
      code,
      codeType: type,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });

    // Send email
    await this.emailService.sendVerificationCode(ctx, email, code, type);

    // Cleanup old codes (older than 24h)
    await VC.remove({
      email,
    }).where('created_at < ?', new Date(Date.now() - 86400_000));
  }

  async verify(ctx: Context, email: string, code: string, type: 'register' | 'reset_password'): Promise<boolean> {
    const VC = this.db(ctx);
    const inputCode = String(code).trim();

    // Match code directly in SQL query to avoid ORM type mismatch
    const [record] = await VC.find({
      email,
      code: inputCode,
      codeType: type,
      used: 0,
    }).where('expires_at >= ?', new Date()).order('id DESC').limit(1);

    if (!record) {
      // Check if there's an expired/used code to give better error message
      const [anyRecord] = await VC.find({
        email,
        codeType: type,
      }).order('id DESC').limit(1);

      if (!anyRecord) {
        throw new Error('認証コードが無効または期限切れです');
      }

      const attempts = (anyRecord.attempts || 0) + 1;
      await VC.update({ id: anyRecord.id }, { attempts });

      if (attempts > 5) {
        await VC.update({ id: anyRecord.id }, { used: 1 });
        throw new Error('試行回数が上限に達しました。新しいコードを取得してください');
      }

      if (anyRecord.used) {
        throw new Error('認証コードは既に使用されています');
      }

      throw new Error('認証コードが正しくありません');
    }

    // Mark as used
    await VC.update({ id: record.id }, { used: 1 });
    return true;
  }
}
