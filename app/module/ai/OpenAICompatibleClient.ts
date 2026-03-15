import { AIClient, ChatMessage } from './AIClient';

/**
 * OpenAI-compatible streaming client.
 * Works with DeepSeek, ERNIE (Baidu), Qianwen (Alibaba DashScope), etc.
 */
export class OpenAICompatibleClient implements AIClient {
  private baseURL: string;
  private apiKey: string;
  private model: string;

  constructor(baseURL: string, apiKey: string, model: string) {
    this.baseURL = baseURL.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.model = model;
  }

  async *streamChat(messages: ChatMessage[], systemPrompt?: string): AsyncGenerator<string, void, unknown> {
    const apiMessages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      apiMessages.push({ role: 'system', content: systemPrompt });
    }

    for (const m of messages) {
      if (m.role !== 'system') {
        apiMessages.push({ role: m.role, content: m.content });
      }
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: apiMessages,
        stream: true,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error ${response.status}: ${errorText}`);
    }

    const reader = (response.body as any)?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // skip unparseable lines
        }
      }
    }
  }
}
