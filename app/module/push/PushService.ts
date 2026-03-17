/**
 * PushService — 推送通知服务
 *
 * 当前实现：
 *   - 存储/删除设备令牌（Expo Push Token / FCM Token）
 *   - send() 方法通过 Expo Push Service 发送通知
 *
 * 生产环境：
 *   - 需在环境变量中配置 EXPO_PUSH_TOKEN（Expo Access Token）
 *   - 或配置 FCM_SERVER_KEY 使用 Firebase FCM 直接发送
 */

import { ContextProto, AccessLevel } from '@eggjs/tegg';
import { Context } from 'egg';
import { v4 as uuidv4 } from 'uuid';

function boneData(bone: unknown): Record<string, unknown> {
  if (bone && typeof (bone as { getRaw?: () => Record<string, unknown> }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone as Record<string, unknown>;
}

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

@ContextProto({
  accessLevel: AccessLevel.PUBLIC,
})
export class PushService {
  /** 注册或更新设备令牌 */
  async register(ctx: Context, userId: string, token: string, platform = 'expo') {
    const existing = await ctx.model.DeviceToken.findOne({ userId, token });
    if (existing) return boneData(existing as unknown as Record<string, unknown>);

    const created = await ctx.model.DeviceToken.create({
      id: uuidv4(),
      userId,
      token,
      platform,
    });
    return boneData(created as unknown as Record<string, unknown>);
  }

  /** 注销设备令牌 */
  async unregister(ctx: Context, userId: string, token: string) {
    await ctx.model.DeviceToken.remove({ userId, token });
  }

  /** 获取用户所有设备令牌 */
  async getTokens(ctx: Context, userId: string): Promise<string[]> {
    const rows = await ctx.model.DeviceToken.find({ userId });
    return (rows as unknown[]).map((r) => boneData(r as Record<string, unknown>).token as string);
  }

  /** 向用户所有设备发送推送通知 */
  async sendToUser(ctx: Context, userId: string, message: PushMessage) {
    const tokens = await this.getTokens(ctx, userId);
    if (tokens.length === 0) return;
    await this.send(tokens, message);
  }

  /** 通过 Expo Push Service 发送通知（需配置 EXPO_ACCESS_TOKEN） */
  async send(tokens: string[], message: PushMessage) {
    // 只处理 Expo push tokens（以 ExponentPushToken 开头）
    const expoTokens = tokens.filter((t) => t.startsWith('ExponentPushToken'));
    if (expoTokens.length === 0) return;

    const messages = expoTokens.map((to) => ({
      to,
      title: message.title,
      body: message.body,
      data: message.data || {},
      sound: 'default',
    }));

    const accessToken = process.env.EXPO_ACCESS_TOKEN;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(messages),
      });
    } catch {
      // 推送失败不影响主业务
    }
  }
}
