/**
 * DashScopeSTTProvider — 阿里云百炼语音识别
 *
 * 使用 DashScope Paraformer API（同步短音频识别，<= 60s）。
 * 与 Chat AI 共用同一个 QIANWEN_API_KEY，无需额外开通服务。
 *
 * 支持模型：
 *   paraformer-realtime-v2  — 通用实时识别（默认）
 *   fun-asr-realtime        — 百炼平台别名
 *
 * 文档: https://help.aliyun.com/zh/model-studio/developer-reference/paraformer
 */

import { STTProvider, STTResult } from './STTProvider';

interface DashScopeRecognitionSentence {
  text: string;
  begin_time?: number;
  end_time?: number;
}

interface DashScopeRecognitionOutput {
  text?: string;
  sentence?: DashScopeRecognitionSentence[];
}

interface DashScopeRecognitionResponse {
  output?: DashScopeRecognitionOutput;
  request_id?: string;
  code?: string;
  message?: string;
}

export class DashScopeSTTProvider implements STTProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'paraformer-realtime-v2') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async transcribe(audio: Buffer, mimeType: string, language = 'ja'): Promise<STTResult> {
    const audioBase64 = audio.toString('base64');
    const format = mimeToFormat(mimeType);

    const body = {
      model: this.model,
      input: {
        audio: audioBase64,
      },
      parameters: {
        format,
        language_hints: [language],
        enable_punctuation_prediction: true,
        enable_inverse_text_normalization: true,
      },
    };

    const response = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/recognition',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DashScope STT HTTP error: ${response.status} ${errText}`);
    }

    const json = await response.json() as DashScopeRecognitionResponse;

    // API 级错误（如参数错误）
    if (json.code && json.code !== '200' && json.code !== 'Success') {
      throw new Error(`DashScope STT error: ${json.code} ${json.message}`);
    }

    const output = json.output || {};

    // 优先用 output.text，否则拼接 sentences
    const text =
      output.text ||
      (output.sentence || []).map((s) => s.text).join('') ||
      '';

    return { text: text.trim(), language };
  }
}

function mimeToFormat(mime: string): string {
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
