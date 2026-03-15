import Anthropic from '@anthropic-ai/sdk';
import { AIClient, ChatMessage } from './AIClient';

export class ClaudeClient implements AIClient {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async *streamChat(messages: ChatMessage[], systemPrompt?: string): AsyncGenerator<string, void, unknown> {
    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 2048,
      system: systemPrompt || '',
      messages: anthropicMessages,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  }
}
