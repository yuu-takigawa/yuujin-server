export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIClient {
  /** Stream chat completion, yielding content deltas */
  streamChat(messages: ChatMessage[], systemPrompt?: string): AsyncGenerator<string, void, unknown>;
}
