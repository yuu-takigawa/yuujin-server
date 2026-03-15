import { ContextProto, AccessLevel } from '@eggjs/tegg';
import { AIClient, ChatMessage } from './AIClient';
import { ClaudeClient } from './ClaudeClient';
import { OpenAICompatibleClient } from './OpenAICompatibleClient';

interface ProviderConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
}

interface AIConfig {
  provider: string;
  claude: ProviderConfig;
  qianwen: ProviderConfig;
  deepseek: ProviderConfig;
  ernie: ProviderConfig;
  [key: string]: string | ProviderConfig;
}

// Default base URLs for OpenAI-compatible providers
const PROVIDER_BASE_URLS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
  ernie: 'https://qianfan.baidubce.com/v2',
  qianwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
};

@ContextProto({
  accessLevel: AccessLevel.PUBLIC,
})
export class AIService {
  createClient(aiConfig: AIConfig, provider?: string): AIClient {
    const p = provider || aiConfig.provider;
    const providerConfig = aiConfig[p] as ProviderConfig | undefined;

    if (!providerConfig) {
      throw new Error(`Provider "${p}" is not configured`);
    }

    const { apiKey, model } = providerConfig;

    switch (p) {
      case 'claude': {
        if (!apiKey) {
          throw new Error('CLAUDE_API_KEY is not configured');
        }
        return new ClaudeClient(apiKey, model);
      }
      case 'deepseek':
      case 'ernie':
      case 'qianwen': {
        if (!apiKey) {
          throw new Error(`${p.toUpperCase()}_API_KEY is not configured`);
        }
        const baseURL = providerConfig.baseURL || PROVIDER_BASE_URLS[p];
        if (!baseURL) {
          throw new Error(`No base URL configured for provider: ${p}`);
        }
        return new OpenAICompatibleClient(baseURL, apiKey, model);
      }
      default:
        throw new Error(`Unknown AI provider: ${p}`);
    }
  }

  async *streamChat(
    aiConfig: AIConfig,
    messages: ChatMessage[],
    systemPrompt?: string,
    provider?: string,
  ): AsyncGenerator<string, void, unknown> {
    const client = this.createClient(aiConfig, provider);
    yield* client.streamChat(messages, systemPrompt);
  }
}
