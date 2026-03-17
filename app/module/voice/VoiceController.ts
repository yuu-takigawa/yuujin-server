/**
 * VoiceController
 *
 * POST /voice/transcribe  — 语音转文字
 *   multipart/form-data: file (audio), language? (ja|zh|en)
 *
 * 根据环境变量 STT_PROVIDER 选择实现：
 *   ali    — 阿里云 NLS（默认，国内推荐）
 *   whisper — OpenAI Whisper（国际）
 */

import {
  HTTPController,
  HTTPMethod,
  HTTPMethodEnum,
  Context,
} from '@eggjs/tegg';
import { EggContext } from '@eggjs/tegg';
import { Context as EggCtx } from 'egg';
import { AliSTTProvider } from './stt/AliSTTProvider';
import { WhisperProvider } from './stt/WhisperProvider';
import { STTProvider } from './stt/STTProvider';

@HTTPController({
  path: '/voice',
})
export class VoiceController {
  private getSTTProvider(ctx: EggCtx): STTProvider {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bizConfig = (ctx.app.config as any).bizConfig;
    const sttProvider = process.env.STT_PROVIDER || bizConfig?.stt?.provider || 'ali';

    if (sttProvider === 'whisper') {
      return new WhisperProvider({
        apiKey: process.env.OPENAI_API_KEY || bizConfig?.stt?.whisper?.apiKey || '',
        baseURL: process.env.OPENAI_BASE_URL || bizConfig?.stt?.whisper?.baseURL,
      });
    }

    // Default: AliCloud NLS
    return new AliSTTProvider({
      accessKeyId: process.env.ALI_STT_ACCESS_KEY_ID || bizConfig?.stt?.ali?.accessKeyId || '',
      accessKeySecret: process.env.ALI_STT_ACCESS_KEY_SECRET || bizConfig?.stt?.ali?.accessKeySecret || '',
      appKey: process.env.ALI_STT_APP_KEY || bizConfig?.stt?.ali?.appKey || '',
      region: process.env.ALI_STT_REGION || bizConfig?.stt?.ali?.region || 'cn-shanghai',
    });
  }

  /** POST /voice/transcribe */
  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/transcribe' })
  async transcribe(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;

    let fileStream: NodeJS.ReadableStream & { mimeType?: string; filename?: string };
    let fields: Record<string, string> = {};

    try {
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
      return { success: false, error: 'No audio file provided' };
    }

    const mimeType = fileStream.mimeType || 'audio/wav';
    const language = fields.language || 'ja';

    // 收集 Buffer
    const chunks: Buffer[] = [];
    for await (const chunk of fileStream) {
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) {
      eggCtx.status = 400;
      return { success: false, error: 'Empty audio file' };
    }

    // 文件大小限制（10MB）
    if (buffer.length > 10 * 1024 * 1024) {
      eggCtx.status = 413;
      return { success: false, error: 'Audio file too large (max 10MB)' };
    }

    try {
      const provider = this.getSTTProvider(eggCtx);
      const result = await provider.transcribe(buffer, mimeType, language);
      return { success: true, data: result };
    } catch (err) {
      eggCtx.status = 500;
      const message = err instanceof Error ? err.message : 'STT failed';
      return { success: false, error: message };
    }
  }
}
