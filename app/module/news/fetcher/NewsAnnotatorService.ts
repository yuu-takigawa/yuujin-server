/**
 * NewsAnnotatorService — AI 按需注释（按段落）
 *
 * 不再预注释整篇文章。用户点击段落时触发：
 *   - translation: 段落中文翻译（流式）
 *   - explanation: 语法/表达解说（流式）
 * 结果缓存到 news.annotations.cache，其他用户直接读缓存。
 */

import { ProductAIConfig } from '../../ai/ProductAIService';
import { ChatMessage } from '../../ai/AIClient';
import { ClaudeClient } from '../../ai/ClaudeClient';
import { OpenAICompatibleClient } from '../../ai/OpenAICompatibleClient';

const PROVIDER_BASE_URLS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
  ernie: 'https://qianfan.baidubce.com/v2',
  qianwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
};

function createClient(config: ProductAIConfig) {
  const provider = config.provider;
  const providerConfig = config[provider] as { apiKey: string; model: string; baseURL?: string } | undefined;
  if (!providerConfig?.apiKey) {
    throw new Error(`ProductAI provider "${provider}" not configured`);
  }
  if (provider === 'claude') {
    return new ClaudeClient(providerConfig.apiKey, providerConfig.model);
  }
  const baseURL = providerConfig.baseURL || PROVIDER_BASE_URLS[provider];
  if (!baseURL) throw new Error(`No base URL for provider: ${provider}`);
  return new OpenAICompatibleClient(baseURL, providerConfig.apiKey, providerConfig.model);
}

export class NewsAnnotatorService {
  private aiConfig: ProductAIConfig;

  constructor(aiConfig: ProductAIConfig) {
    this.aiConfig = aiConfig;
  }

  /** 流式翻译一个段落 */
  async *streamTranslation(paragraphText: string, articleTitle: string): AsyncGenerator<string> {
    const client = createClient(this.aiConfig);
    const systemPrompt = '你是一个面向中国日语学习者的翻译AI。请将日语段落翻译为自然流畅的中文。只输出翻译结果，不要附加任何说明或前缀。';
    const messages: ChatMessage[] = [{
      role: 'user',
      content: `文章标题: ${articleTitle}\n\n请翻译以下日语段落:\n${paragraphText}`,
    }];
    yield* client.streamChat(messages, systemPrompt);
  }

  /** 流式解说一个段落的语法和表达 */
  async *streamExplanation(paragraphText: string, articleTitle: string): AsyncGenerator<string> {
    const client = createClient(this.aiConfig);
    const systemPrompt = '你是一个面向中国日语学习者的语法解说AI。请用中文详细解说日语段落中的重要语法结构、关键词汇的含义和用法、以及为什么这样表达。200字以内，直接输出解说内容，不要加前缀。';
    const messages: ChatMessage[] = [{
      role: 'user',
      content: `文章标题: ${articleTitle}\n\n请解说以下日语段落中的语法和表达:\n${paragraphText}`,
    }];
    yield* client.streamChat(messages, systemPrompt);
  }
}
