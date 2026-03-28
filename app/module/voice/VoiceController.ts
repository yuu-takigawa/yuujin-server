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
import { PassThrough } from 'stream';
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

    // 1. 查内存缓存（O(1)，无网络）
    const cachedUrl = getCached(cacheKey);
    if (cachedUrl) {
      return { success: true, data: { url: cachedUrl, cached: true } };
    }

    // 2. 直接调 DashScope（不查 OSS，避免 HEAD 请求延迟）
    // 内存缓存命中率高，OSS 仅在服务重启后有用（由 tts-stream 路由的缓存检查覆盖）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bizConfig = (eggCtx.app.config as any).bizConfig;
    const apiKey = process.env.QIANWEN_API_KEY || bizConfig?.ai?.qianwen?.apiKey || '';

    try {
      const ttsProvider = new TTSProvider(apiKey);
      const result = await ttsProvider.synthesize(text, voice, 'Japanese');

      // 先返回 DashScope 临时 URL（快速响应），后台异步上传到 OSS
      const oss = this.getOSSService(eggCtx);
      const ossKeyVal = `tts-cache/${cacheKey}.mp3`;
      // 后台上传：不阻塞响应
      fetch(result.audioUrl)
        .then(async (audioRes) => {
          if (!audioRes.ok) return;
          const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
          const uploaded = await oss.upload(ossKeyVal, audioBuffer, 'audio/mpeg');
          setCache(cacheKey, uploaded.url);
        })
        .catch(() => { /* silent — 下次请求会重试 */ });

      return { success: true, data: { url: result.audioUrl, cached: false } };
    } catch (err) {
      eggCtx.status = 500;
      const message = err instanceof Error ? err.message : 'TTS failed';
      return { success: false, error: message };
    }
  }

  /**
   * POST /voice/tts-stream — 流式 TTS（SSE）
   *
   * Body: { text: string, voice?: string }
   * Response: text/event-stream
   *   data: {"audio":"<base64 PCM>"}    ← 每个音频分片
   *   data: [DONE]                       ← 结束
   *
   * 调用 DashScope 时带 X-DashScope-SSE: enable，逐片转发。
   */
  @HTTPMethod({ method: HTTPMethodEnum.POST, path: '/tts-stream' })
  async ttsStream(@Context() ctx: EggContext) {
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

    if (text.length > 1500) {
      eggCtx.status = 400;
      return { success: false, error: 'text too long (max 1500 chars)' };
    }

    const voice = body.voice || 'Cherry';
    const cacheKeyStream = getCacheKey(text, voice);

    // 缓存检查：命中则返回 cachedUrl（前端用 new Audio() 播放）
    // iOS Safari PWA 下 Web Audio API 不出声，只有 new Audio() 能出声
    const cachedStreamUrl = getCached(cacheKeyStream);
    if (cachedStreamUrl) {
      eggCtx.set('Content-Type', 'text/event-stream');
      eggCtx.set('Cache-Control', 'no-cache');
      eggCtx.set('Connection', 'keep-alive');
      eggCtx.set('X-Accel-Buffering', 'no');
      const s = new PassThrough();
      eggCtx.body = s;
      s.write(`data: ${JSON.stringify({ cachedUrl: cachedStreamUrl })}\n\n`);
      s.write('data: [DONE]\n\n');
      s.end();
      return;
    }

    // 查 OSS
    try {
      const ossCheck = this.getOSSService(eggCtx);
      const ossUrlCheck = await ossCheck.exists(`tts-cache/${cacheKeyStream}.mp3`);
      if (ossUrlCheck) {
        setCache(cacheKeyStream, ossUrlCheck);
        eggCtx.set('Content-Type', 'text/event-stream');
        eggCtx.set('Cache-Control', 'no-cache');
        eggCtx.set('Connection', 'keep-alive');
        eggCtx.set('X-Accel-Buffering', 'no');
        const s = new PassThrough();
        eggCtx.body = s;
        s.write(`data: ${JSON.stringify({ cachedUrl: ossUrlCheck })}\n\n`);
        s.write('data: [DONE]\n\n');
        s.end();
        return;
      }
    } catch { /* proceed to DashScope */ }

    // 未缓存：走 DashScope 流式
    // SSE headers
    eggCtx.set('Content-Type', 'text/event-stream');
    eggCtx.set('Cache-Control', 'no-cache');
    eggCtx.set('Connection', 'keep-alive');
    eggCtx.set('X-Accel-Buffering', 'no');

    const stream = new PassThrough();
    eggCtx.body = stream;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bizConfig = (eggCtx.app.config as any).bizConfig;
    const apiKey = process.env.QIANWEN_API_KEY || bizConfig?.ai?.qianwen?.apiKey || '';

    try {
      const response = await fetch(
        'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-DashScope-SSE': 'enable',
          },
          body: JSON.stringify({
            model: 'qwen3-tts-flash',
            input: { text, voice, language_type: 'Japanese' },
          }),
        },
      );

      if (!response.ok || !response.body) {
        stream.write(`data: {"error":"DashScope error: ${response.status}"}\n\n`);
        stream.write('data: [DONE]\n\n');
        stream.end();
        return;
      }

      // 逐行解析 DashScope SSE，提取 audio.data 转发给客户端
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value as Uint8Array, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const parsed = JSON.parse(jsonStr) as any;
            const audioData = parsed?.output?.audio?.data;
            if (audioData) {
              stream.write(`data: ${JSON.stringify({ audio: audioData })}\n\n`);
            }
          } catch { /* skip malformed lines */ }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'TTS stream failed';
      stream.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    }

    stream.write('data: [DONE]\n\n');
    stream.end();

    // 后台异步：调非流式 TTS 生成 + 上传 OSS + 写缓存，下次直接命中
    if (!getCached(cacheKeyStream)) {
      const ttsProvider = new TTSProvider(apiKey);
      ttsProvider.synthesize(text, voice, 'Japanese')
        .then(async (result) => {
          const oss = this.getOSSService(eggCtx);
          const ossKeyVal = `tts-cache/${cacheKeyStream}.mp3`;
          const audioRes = await fetch(result.audioUrl);
          if (!audioRes.ok) return;
          const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
          const uploaded = await oss.upload(ossKeyVal, audioBuffer, 'audio/mpeg');
          setCache(cacheKeyStream, uploaded.url);
        })
        .catch(() => { /* silent — next request will retry */ });
    }
  }
}
