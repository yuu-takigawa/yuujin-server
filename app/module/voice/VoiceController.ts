/**
 * VoiceController
 *
 * POST /voice/transcribe  — 语音转文字 (STT)
 * POST /voice/tts         — 文字转语音 (TTS)
 *
 * STT: 根据 STT_PROVIDER 选择实现 (dashscope / whisper)
 * TTS: Qwen3-TTS via DashScope，24h 缓存 + OSS 持久化
 */

import {
  HTTPController,
  HTTPMethod,
  HTTPMethodEnum,
  Context,
} from '@eggjs/tegg';
import { EggContext } from '@eggjs/tegg';
import { Context as EggCtx } from 'egg';
import * as crypto from 'crypto';
import { DashScopeSTTProvider } from './stt/DashScopeSTTProvider';
import { WhisperProvider } from './stt/WhisperProvider';
import { STTProvider } from './stt/STTProvider';
import { TTSProvider } from './tts/TTSProvider';
import { OSSService } from '../../common/OSSService';

// ─── TTS 缓存（24h TTL）───
interface CacheEntry {
  url: string;
  expiresAt: number;
}
const ttsCache = new Map<string, CacheEntry>();
const TTS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function getCacheKey(text: string, voice: string): string {
  return crypto.createHash('sha256').update(`${voice}:${text}`).digest('hex');
}

function getCached(key: string): string | null {
  const entry = ttsCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    ttsCache.delete(key);
    return null;
  }
  return entry.url;
}

function setCache(key: string, url: string) {
  ttsCache.set(key, { url, expiresAt: Date.now() + TTS_CACHE_TTL });
}

// 定期清理过期缓存（每小时）
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of ttsCache) {
    if (now > entry.expiresAt) ttsCache.delete(key);
  }
}, 60 * 60 * 1000);

@HTTPController({
  path: '/voice',
})
export class VoiceController {
  private getSTTProvider(ctx: EggCtx): STTProvider {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bizConfig = (ctx.app.config as any).bizConfig;
    const sttProvider = process.env.STT_PROVIDER || bizConfig?.stt?.provider || 'dashscope';

    if (sttProvider === 'whisper') {
      return new WhisperProvider({
        apiKey: process.env.OPENAI_API_KEY || bizConfig?.stt?.whisper?.apiKey || '',
        baseURL: process.env.OPENAI_BASE_URL || bizConfig?.stt?.whisper?.baseURL,
      });
    }

    // Default: DashScope Paraformer
    const apiKey = process.env.QIANWEN_API_KEY || bizConfig?.ai?.qianwen?.apiKey || '';
    const model = process.env.DASHSCOPE_STT_MODEL || bizConfig?.stt?.dashscope?.model || 'paraformer-realtime-v2';
    return new DashScopeSTTProvider(apiKey, model);
  }

  private getOSSService(ctx: EggCtx): OSSService {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ossConfig = (ctx.app.config as any).bizConfig?.oss;
    return new OSSService({
      region: process.env.OSS_REGION || ossConfig?.region || 'oss-cn-hangzhou',
      bucket: process.env.OSS_BUCKET || ossConfig?.bucket || 'yuujin-assets',
      accessKeyId: process.env.OSS_ACCESS_KEY_ID || ossConfig?.accessKeyId || '',
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || ossConfig?.accessKeySecret || '',
      cdnDomain: process.env.OSS_CDN_DOMAIN || ossConfig?.cdnDomain,
    });
  }

  /** POST /voice/transcribe — 语音转文字 */
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

  /**
   * POST /voice/tts — 文字转语音
   *
   * Body: { text: string, voice?: string }
   * Response: { success: true, data: { url: string, cached: boolean } }
   *
   * 缓存策略：hash(text + voice) → 先查内存缓存(24h) → 命中返回 OSS URL
   *           未命中 → 调 Qwen3-TTS → 下载音频 → 上传 OSS → 缓存 → 返回
   */
  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/tts' })
  async tts(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;

    let body: { text?: string; voice?: string };
    try {
      body = eggCtx.request.body || {};
    } catch {
      eggCtx.status = 400;
      return { success: false, error: 'Invalid request body' };
    }

    const text = body.text?.trim();
    if (!text) {
      eggCtx.status = 400;
      return { success: false, error: 'text is required' };
    }

    // 文本长度限制（512 tokens ≈ 1500 字符）
    if (text.length > 1500) {
      eggCtx.status = 400;
      return { success: false, error: 'text too long (max 1500 chars)' };
    }

    const voice = body.voice || 'Cherry';
    const cacheKey = getCacheKey(text, voice);

    // 1. 查缓存
    const cachedUrl = getCached(cacheKey);
    if (cachedUrl) {
      return { success: true, data: { url: cachedUrl, cached: true } };
    }

    try {
      // 2. 调 TTS API
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bizConfig = (eggCtx.app.config as any).bizConfig;
      const apiKey = process.env.QIANWEN_API_KEY || bizConfig?.ai?.qianwen?.apiKey || '';
      const ttsProvider = new TTSProvider(apiKey);
      const result = await ttsProvider.synthesize(text, voice, 'Japanese');

      // 3. 下载音频并上传到 OSS
      const audioRes = await fetch(result.audioUrl);
      if (!audioRes.ok) {
        throw new Error(`Failed to download TTS audio: ${audioRes.status}`);
      }
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

      const ossKey = `tts-cache/${cacheKey}.mp3`;
      const oss = this.getOSSService(eggCtx);
      const uploaded = await oss.upload(ossKey, audioBuffer, 'audio/mpeg');

      // 4. 写缓存
      setCache(cacheKey, uploaded.url);

      return { success: true, data: { url: uploaded.url, cached: false } };
    } catch (err) {
      eggCtx.status = 500;
      const message = err instanceof Error ? err.message : 'TTS failed';
      return { success: false, error: message };
    }
  }
}
