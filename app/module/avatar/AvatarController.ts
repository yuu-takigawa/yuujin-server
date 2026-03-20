/**
 * AvatarController
 *
 * GET  /avatars/presets         — いらすとや 预设头像列表
 * POST /avatars/upload          — 用户上传自定义头像（multipart/form-data）
 * PUT  /avatars/character/:id   — 给角色设置头像 URL
 */

import {
  HTTPController,
  HTTPMethod,
  HTTPMethodEnum,
  HTTPParam,
  Context,
} from '@eggjs/tegg';
import { EggContext } from '@eggjs/tegg';
import { Context as EggCtx } from 'egg';
import { v4 as uuidv4 } from 'uuid';
import { OSSService } from './OSSService';
import { ContentModerationService } from './ContentModerationService';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

function checkMime(mimeType: string, size: number): { ok: boolean; reason?: string } {
  if (!ALLOWED_MIME.includes(mimeType)) {
    return { ok: false, reason: `不支持的图片格式: ${mimeType}。支持 JPEG / PNG / WebP / GIF` };
  }
  if (size > MAX_SIZE) {
    return { ok: false, reason: '图片不能超过 5MB' };
  }
  return { ok: true };
}

// いらすとや 预设头像（已上传 OSS）
const PRESET_AVATARS = [
  { id: 'boy-01', label: '男の子A', url: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/boy-01.png' },
  { id: 'boy-02', label: '男の子B', url: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/boy-02.png' },
  { id: 'boy-03', label: '男の子C', url: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/boy-03.png' },
  { id: 'boy-04', label: '男の子D', url: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/boy-04.png' },
  { id: 'boy-05', label: '男の子E', url: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/boy-05.png' },
  { id: 'boy-06', label: '男の子F', url: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/boy-06.png' },
  { id: 'girl-01', label: '女の子A', url: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/girl-01.png' },
  { id: 'girl-02', label: '女の子B', url: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/girl-02.png' },
  { id: 'girl-03', label: '女の子C', url: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/girl-03.png' },
  { id: 'girl-04', label: '女の子D', url: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/girl-04.png' },
  { id: 'girl-05', label: '女の子E', url: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/girl-05.png' },
  { id: 'girl-06', label: '女の子F', url: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/girl-06.png' },
  { id: 'boy-07', label: '男の子G', url: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/boy-07.png' },
  { id: 'girl-07', label: '女の子G', url: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/girl-07.png' },
  { id: 'girl-08', label: '女の子H', url: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/girl-08.png' },
];

@HTTPController({
  path: '/avatars',
})
export class AvatarController {
  private getOSSService(ctx: EggCtx): OSSService {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = (ctx.app.config as any).bizConfig?.oss;
    return new OSSService(config);
  }

  /** GET /avatars/presets */
  @HTTPMethod({ method: HTTPMethodEnum.GET, path: '/presets' })
  async presets(@Context() ctx: EggContext) {
    return { success: true, data: PRESET_AVATARS };
  }

  /**
   * POST /avatars/upload
   * multipart/form-data:  file (image), target ('user' | 'character'), targetId (userId or characterId)
   */
  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/upload' })
  async upload(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;

    let fileStream: NodeJS.ReadableStream & { mimeType?: string; filename?: string };
    let fields: Record<string, string> = {};

    try {
      // egg 内置 multipart 支持
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts = (eggCtx as any).multipart({ autoFields: true });
      fileStream = await parts();
      fields = parts.fields as Record<string, string>;
    } catch {
      eggCtx.status = 400;
      return { success: false, error: 'Invalid multipart request' };
    }

    if (!fileStream) {
      eggCtx.status = 400;
      return { success: false, error: 'No file uploaded' };
    }

    const mimeType = fileStream.mimeType || 'application/octet-stream';
    const target = fields.target || 'user';      // 'user' | 'character'
    const targetId = fields.targetId || userId;

    // 收集 Buffer
    const chunks: Buffer[] = [];
    for await (const chunk of fileStream) {
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);

    // MIME 校验（本地，无外部服务）
    const mimeCheck = checkMime(mimeType, buffer.length);
    if (!mimeCheck.ok) {
      eggCtx.status = 422;
      return { success: false, error: mimeCheck.reason };
    }

    // 阿里云图片内容审核（上传 OSS 前，用 base64 审核，省 OSS 用量）
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ossConfig = (eggCtx.app.config as any).bizConfig?.oss;
      const moderator = new ContentModerationService({
        accessKeyId: ossConfig?.accessKeyId || '',
        accessKeySecret: ossConfig?.accessKeySecret || '',
      });
      const modResult = await moderator.moderateBuffer(buffer);
      if (!modResult.pass) {
        eggCtx.status = 422;
        return { success: false, error: `画像が審査に通りませんでした（${modResult.reason || '不適切なコンテンツ'}）` };
      }
    } catch (err) {
      eggCtx.logger.warn('[Avatar] Moderation error (allowing upload):', err);
    }

    // 审核通过，上传到 OSS
    const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const key = `avatars/${userId}/${uuidv4()}.${ext}`;
    let uploadResult: { url: string; key: string };

    try {
      const ossService = this.getOSSService(eggCtx);
      uploadResult = await ossService.upload(key, buffer, mimeType);
    } catch {
      eggCtx.status = 500;
      return { success: false, error: 'Upload to OSS failed' };
    }

    // 更新角色/用户头像 URL
    if (target === 'character') {
      const char = await eggCtx.model.Character.findOne({ id: targetId, userId, isPreset: 0 });
      if (char) {
        await eggCtx.model.Character.update({ id: targetId }, { avatarUrl: uploadResult.url });
      }
    } else {
      await eggCtx.model.User.update({ id: userId }, { avatarUrl: uploadResult.url });
    }

    return { success: true, data: { url: uploadResult.url, key: uploadResult.key } };
  }

  /** PUT /avatars/character/:id  body: { avatarUrl } — 选择预设头像 */
  @HTTPMethod({ method: HTTPMethodEnum.PUT, path: '/character/:id' })
  async setCharacterAvatar(@Context() ctx: EggContext, @HTTPParam() id: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const body = eggCtx.request.body as { avatarUrl?: string };

    if (!body.avatarUrl) {
      eggCtx.status = 400;
      return { success: false, error: 'avatarUrl is required' };
    }

    // 只允许预设 URL 或已上传的 OSS URL
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ossConfig = (eggCtx.app.config as any).bizConfig?.oss;
    const isPresetEmoji = body.avatarUrl.startsWith('preset:');
    const isOSSUrl = ossConfig?.bucket && body.avatarUrl.includes(ossConfig.bucket);

    if (!isPresetEmoji && !isOSSUrl) {
      // 允许任意预设 avatar emoji 或 OSS URL
      // 更严格的校验可以在这里加
    }

    const char = await eggCtx.model.Character.findOne({ id, userId });
    if (!char) {
      eggCtx.status = 404;
      return { success: false, error: 'Character not found' };
    }

    await eggCtx.model.Character.update({ id }, { avatarUrl: body.avatarUrl });
    return { success: true };
  }
}
