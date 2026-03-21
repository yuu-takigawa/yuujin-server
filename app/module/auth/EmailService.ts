import { ContextProto, AccessLevel } from '@eggjs/tegg';
import * as nodemailer from 'nodemailer';
import { Context } from 'egg';

@ContextProto({
  accessLevel: AccessLevel.PUBLIC,
})
export class EmailService {
  private getTransporter(ctx: Context) {
    const smtp = (ctx.app.config as any).bizConfig.smtp;
    return nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.auth,
      authMethod: 'LOGIN',
    });
  }

  async sendVerificationCode(ctx: Context, to: string, code: string, type: 'register' | 'reset_password') {
    const smtp = (ctx.app.config as any).bizConfig.smtp;
    const transporter = this.getTransporter(ctx);

    const subject = type === 'register'
      ? '【Yuujin】アカウント登録の認証コード'
      : '【Yuujin】パスワード再設定の認証コード';

    const html = `
      <div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#333;">
        <div style="text-align:center;padding:32px 0 16px;">
          <span style="font-size:24px;font-weight:700;color:#E85B3A;">Yuujin・友人</span>
        </div>
        <div style="background:#F9FAFB;border-radius:12px;padding:32px;text-align:center;">
          <p style="font-size:15px;color:#666;margin:0 0 20px;">
            ${type === 'register' ? 'アカウント登録' : 'パスワード再設定'}の認証コードです
          </p>
          <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#E85B3A;padding:16px 0;">
            ${code}
          </div>
          <p style="font-size:13px;color:#999;margin:16px 0 0;">
            このコードは10分間有効です。<br/>
            心当たりのない場合は、このメールを無視してください。
          </p>
        </div>
        <p style="font-size:11px;color:#CCC;text-align:center;margin-top:24px;">
          © Yuujin — AI日本語会話パートナー
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Yuujin" <${smtp.from}>`,
      to,
      subject,
      html,
    });
  }
}
