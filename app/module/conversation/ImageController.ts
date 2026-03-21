/**
 * ImageController — 对话图片上传
 *
 * POST /chat/image  — 上传图片到 OSS，返回 URL
 */

import {
  HTTPController,
  HTTPMethod,
  HTTPMethodEnum,
  Context,
} from '@eggjs/tegg';
import { EggContext } from '@eggjs/tegg';
import { Context as EggCtx } from 'egg';
import { v4 as uuidv4 } from 'uuid';
import { OSSService } from '../avatar/OSSService';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

@HTTPController({
  path: '/chat',
})
export class ImageController {
  private getOSSService(ctx: EggCtx): OSSService {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = (ctx.app.config as any).bizConfig?.oss;
    return new OSSService(config);
  }

  /** POST /chat/image  multipart: file */
  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/image' })
  async uploadImage(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;

    let fileStream: NodeJS.ReadableStream & { mimeType?: string };

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts = (eggCtx as any).multipart({ autoFields: true });
      fileStream = await parts();
    } catch {
      eggCtx.status = 400;
      return { success: false, error: 'Invalid multipart request' };
    }

    if (!fileStream) {
      eggCtx.status = 400;
      return { success: false, error: 'No file uploaded' };
    }

    const mimeType = fileStream.mimeType || 'application/octet-stream';

    if (!ALLOWED_MIME.includes(mimeType)) {
      eggCtx.status = 422;
      return { success: false, error: `Unsupported format: ${mimeType}` };
    }

    const chunks: Buffer[] = [];
    for await (const chunk of fileStream) {
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length > MAX_SIZE) {
      eggCtx.status = 422;
      return { success: false, error: 'Image too large (max 10MB)' };
    }

    const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const key = `chat-images/${userId}/${uuidv4()}.${ext}`;

    try {
      const ossService = this.getOSSService(eggCtx);
      const result = await ossService.upload(key, buffer, mimeType);
      return { success: true, data: { url: result.url, key: result.key } };
    } catch {
      eggCtx.status = 500;
      return { success: false, error: 'Upload failed' };
    }
  }
}
