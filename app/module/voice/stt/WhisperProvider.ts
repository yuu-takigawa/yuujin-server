/**
 * WhisperProvider — OpenAI Whisper API
 *
 * 国际路线，通过 OpenAI /audio/transcriptions 接口。
 * 支持 m4a / mp3 / wav / webm / ogg 等格式。
 */

import { STTProvider, STTResult } from './STTProvider';

export class WhisperProvider implements STTProvider {
  private apiKey: string;
  private model: string;
  private baseURL: string;

  constructor(config: { apiKey: string; model?: string; baseURL?: string }) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'whisper-1';
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
  }

  async transcribe(audio: Buffer, mimeType: string, language?: string): Promise<STTResult> {
    // 构建 multipart/form-data
    const boundary = `----FormBoundary${Date.now()}`;
    const ext = mimeTypeToExt(mimeType);
    const filename = `audio.${ext}`;

    const parts: Buffer[] = [];
    const appendField = (name: string, value: string) => {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ));
    };

    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ));
    parts.push(audio);
    parts.push(Buffer.from('\r\n'));

    appendField('model', this.model);
    if (language) appendField('language', language);
    appendField('response_format', 'json');

    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    const response = await fetch(`${this.baseURL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Whisper API error: ${response.status} ${err}`);
    }

    const result = await response.json() as { text: string };
    return { text: result.text, language };
  }
}

function mimeTypeToExt(mime: string): string {
  const map: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
  };
  return map[mime] || 'wav';
}
