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
      ? '【Yuujin】验证码 / Verification Code'
      : '【Yuujin】重置密码 / Reset Password';

    const actionZh = type === 'register' ? '注册账号' : '重置密码';
    const actionEn = type === 'register' ? 'Account Registration' : 'Password Reset';

    const html = `
      <div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#333;">
        <div style="text-align:center;padding:32px 0 16px;">
          <span style="font-size:24px;font-weight:700;color:#E85B3A;">Yuujin・友人</span>
        </div>
        <div style="background:#F9FAFB;border-radius:12px;padding:32px;text-align:center;">
          <p style="font-size:15px;color:#666;margin:0 0 20px;">
            您的${actionZh}验证码 / Your ${actionEn} Code
          </p>
          <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#E85B3A;padding:16px 0;">
            ${code}
          </div>
          <p style="font-size:13px;color:#999;margin:16px 0 0;">
            验证码10分钟内有效。<br/>
            This code is valid for 10 minutes.<br/>
            如非本人操作，请忽略此邮件。
          </p>
        </div>
        <p style="font-size:11px;color:#CCC;text-align:center;margin-top:24px;">
          © Yuujin — AI日语会话伙伴
        </p>
        <!-- Apple one-time-code hint -->
        <p style="font-size:0;color:transparent;max-height:0;overflow:hidden;">Your Yuujin verification code is ${code}</p>
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
