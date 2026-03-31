/**
 * DashScopeSTTProvider — 阿里云百炼语音识别
 *
 * 使用 qwen3-asr-flash 模型，同步 HTTP 调用，支持 base64 音频直传。
 * 端点与 TTS 相同: /api/v1/services/aigc/multimodal-generation/generation
 * 共用 QIANWEN_API_KEY。
 *
 * 文档: https://help.aliyun.com/zh/model-studio/qwen-speech-recognition
 */

import { STTProvider, STTResult } from './STTProvider';

export class DashScopeSTTProvider implements STTProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'qwen3-asr-flash') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async transcribe(audio: Buffer, mimeType: string, language = 'ja'): Promise<STTResult> {
    const base64 = audio.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64}`;

    const body = {
      model: this.model,
      input: {
        messages: [
          { role: 'system', content: [{ text: '' }] },
          { role: 'user', content: [{ audio: dataUri }] },
        ],
      },
    };

    const response = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
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

    // 响应格式: { output: { choices: [{ message: { content: [{ text: "识别文本" }] } }] } }
    const json = await response.json() as any;
    const text =
      json?.output?.choices?.[0]?.message?.content?.[0]?.text || '';

    return { text: text.trim(), language };
  }
}
