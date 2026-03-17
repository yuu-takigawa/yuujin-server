/**
 * ProductAIService — 高质量、异步（非流式）AI 调用
 *
 * 区别于 ChatAI（速度优先、流式）：
 *   - 用于后台任务（GrowthEngine、话题生成等）
 *   - 使用更高质量的模型（qianwen-max / deepseek / claude）
 *   - 返回完整文本（收集流式结果）
 */

import { ClaudeClient } from './ClaudeClient';
import { OpenAICompatibleClient } from './OpenAICompatibleClient';
import { ChatMessage } from './AIClient';

interface ProviderConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
}

export interface ProductAIConfig {
  provider: string;
  claude: ProviderConfig;
  qianwen: ProviderConfig;
  deepseek: ProviderConfig;
  ernie: ProviderConfig;
  [key: string]: string | ProviderConfig;
}

const PROVIDER_BASE_URLS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
  ernie: 'https://qianfan.baidubce.com/v2',
  qianwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
};

function createClient(config: ProductAIConfig, provider: string) {
  const providerConfig = config[provider] as ProviderConfig | undefined;
  if (!providerConfig?.apiKey) {
    throw new Error(`ProductAI provider "${provider}" is not configured or missing API key`);
  }

  if (provider === 'claude') {
    return new ClaudeClient(providerConfig.apiKey, providerConfig.model);
  }

  const baseURL = providerConfig.baseURL || PROVIDER_BASE_URLS[provider];
  if (!baseURL) throw new Error(`No base URL for ProductAI provider: ${provider}`);
  return new OpenAICompatibleClient(baseURL, providerConfig.apiKey, providerConfig.model);
}

/**
 * 单次完整 AI 对话（收集全部 token，返回 string）
 */
export async function productAIChat(
  config: ProductAIConfig,
  messages: ChatMessage[],
  systemPrompt?: string,
): Promise<string> {
  const provider = config.provider;
  const client = createClient(config, provider);

  let result = '';
  for await (const delta of client.streamChat(messages, systemPrompt)) {
    result += delta;
  }
  return result;
}
