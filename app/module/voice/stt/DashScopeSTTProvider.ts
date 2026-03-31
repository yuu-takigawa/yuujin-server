/**
 * DashScopeSTTProvider — 阿里云百炼语音识别
 *
 * 使用 DashScope OpenAI 兼容端点，与 Whisper API 格式一致。
 * 共用 QIANWEN_API_KEY，无需额外开通。
 *
 * 模型: sensevoice-v1（50+语言，含日语）
 * 文档: https://help.aliyun.com/zh/model-studio/developer-reference/openai-audio
 */

import { STTProvider, STTResult } from './STTProvider';

export class DashScopeSTTProvider implements STTProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'sensevoice-v1') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async transcribe(audio: Buffer, mimeType: string, language = 'ja'): Promise<STTResult> {
    const ext = mimeToExt(mimeType);

    // 构建 multipart/form-data（与 OpenAI Whisper API 格式一致）
    const boundary = `----FormBoundary${Date.now()}`;
    const parts: Buffer[] = [];

    // file 字段
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ));
    parts.push(audio);
    parts.push(Buffer.from('\r\n'));

    // model 字段
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${this.model}\r\n`,
    ));

    // language 字段
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`,
    ));

    // 结束
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const response = await fetch(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DashScope STT HTTP error: ${response.status} ${errText}`);
    }

    const json = await response.json() as { text?: string };
    const text = json.text || '';

    return { text: text.trim(), language };
  }
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'audio/m4a': 'm4a',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/x-wav': 'wav',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/aac': 'aac',
    'audio/flac': 'flac',
    'audio/pcm': 'pcm',
  };
  return map[mime] || 'm4a';
}
