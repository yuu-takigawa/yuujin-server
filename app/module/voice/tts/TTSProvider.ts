/**
 * TTSProvider — Qwen3-TTS 语音合成
 *
 * 调用 DashScope multimodal-generation API，返回音频 URL。
 * 与 STT / Chat AI 共用 QIANWEN_API_KEY。
 */

export interface TTSResult {
  /** 生成的音频 URL（DashScope 临时 URL，需下载后持久化） */
  audioUrl: string;
  /** 消耗字符数 */
  characters?: number;
}

export class TTSProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'qwen3-tts-flash') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async synthesize(text: string, voice = 'Cherry', language = 'Japanese'): Promise<TTSResult> {
    const response = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          input: {
            text,
            voice,
            language_type: language,
          },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DashScope TTS HTTP error: ${response.status} ${errText}`);
    }

    const json = await response.json() as {
      output?: { audio?: { url?: string } };
      usage?: { characters?: number };
      code?: string;
      message?: string;
    };

    if (json.code) {
      throw new Error(`DashScope TTS error: ${json.code} ${json.message}`);
    }

    const audioUrl = json.output?.audio?.url;
    if (!audioUrl) {
      throw new Error('DashScope TTS: no audio URL in response');
    }

    return {
      audioUrl,
      characters: json.usage?.characters,
    };
  }
}
