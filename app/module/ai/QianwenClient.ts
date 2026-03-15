import { AIClient, ChatMessage } from './AIClient';

/**
 * Qianwen (通义千问) client - stub implementation
 * TODO: Implement with Alibaba Cloud SDK
 */
export class QianwenClient implements AIClient {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async *streamChat(_messages: ChatMessage[], _systemPrompt?: string): AsyncGenerator<string, void, unknown> {
    yield 'Qianwen integration not yet implemented. ';
    yield 'Please configure Claude as the AI provider.';
  }
}
