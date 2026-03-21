import { PassThrough } from 'stream';
import {
  HTTPController,
  HTTPMethod,
  HTTPMethodEnum,
  Inject,
  Context,
} from '@eggjs/tegg';
import { EggContext } from '@eggjs/tegg';
import { Context as EggCtx } from 'egg';
import { ConversationService } from './ConversationService';
import { AIService } from '../ai/AIService';
import { CreditService } from '../credit/CreditService';
import { ChatMessage } from '../ai/AIClient';
import { buildSystemPrompt } from './lib/prompt-loader';
import { detectLanguage } from './lib/language-detect';

function boneData(bone: Record<string, unknown>): Record<string, unknown> {
  if (typeof (bone as { getRaw?: Function }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone;
}

@HTTPController({
  path: '/',
})
export class ChatController {
  @Inject()
  conversationService!: ConversationService;

  @Inject()
  aiService!: AIService;

  @Inject()
  creditService!: CreditService;

  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/chat',
  })
  async chat(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const body = eggCtx.request.body as {
      conversationId?: string;
      message?: string;
    };
    const { conversationId, message } = body;
    const aiConfig = eggCtx.app.config.bizConfig.ai;

    if (!message) {
      eggCtx.status = 400;
      eggCtx.body = { error: 'message is required' };
      return;
    }

    if (!conversationId) {
      eggCtx.status = 400;
      eggCtx.body = { error: 'conversationId is required' };
      return;
    }

    // Validate model access and credits
    let chatModel: {
      model: Record<string, unknown>;
      provider: string;
      apiModelId: string;
      creditsPerChat: number;
      isAdmin: boolean;
    };
    try {
      chatModel = await this.creditService.validateChatCredits(eggCtx, userId);
    } catch (err: unknown) {
      const error = err as Error & { code?: string; required?: number; current?: number; requiredTier?: string };
      if (error.code === 'CREDITS_INSUFFICIENT') {
        eggCtx.status = 402;
        eggCtx.body = {
          success: false,
          error: 'insufficient_credits',
          required: error.required,
          current: error.current,
        };
      } else if (error.code === 'TIER_INSUFFICIENT') {
        eggCtx.status = 403;
        eggCtx.body = {
          success: false,
          error: 'tier_insufficient',
          requiredTier: error.requiredTier,
        };
      } else {
        eggCtx.status = 400;
        eggCtx.body = { success: false, error: error.message };
      }
      return;
    }

    // Verify conversation ownership
    const conversation = await this.conversationService.getById(eggCtx, conversationId, userId);
    if (!conversation) {
      eggCtx.status = 404;
      eggCtx.body = { error: 'Conversation not found' };
      return;
    }

    // Load character info for prompt building
    const characterId = (conversation as Record<string, unknown>).characterId as string;
    const character = await eggCtx.model.Character.findOne({ id: characterId });
    const charData = character ? boneData(character as Record<string, unknown>) : null;

    // Load user info for level-based prompt
    const user = await eggCtx.model.User.findOne({ id: userId });
    const userData = user ? boneData(user as Record<string, unknown>) : null;

    // Load per-friendship soul + memory
    const friendship = await eggCtx.model.Friendship.findOne({ userId, characterId });
    const friendshipData = friendship ? boneData(friendship as Record<string, unknown>) : null;

    // Detect language of user message
    const language = detectLanguage(message);

    // Save user message
    await this.conversationService.saveMessage(
      eggCtx, conversationId, 'user', message,
      language !== 'unknown' ? language : undefined,
      undefined,
    );

    // Load conversation history
    const history = await this.conversationService.getMessages(eggCtx, conversationId);
    const messages: ChatMessage[] = history.map((m: Record<string, unknown>) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content as string,
    }));

    // Detect news reference in the latest user message and inject full article
    const newsRefMatch = message.match(/^📰\[([^\]]+)\]\s*.+$/);
    if (newsRefMatch) {
      const newsId = newsRefMatch[1];
      try {
        const news = await eggCtx.model.News.findOne({ id: newsId });
        if (news) {
          const nd = boneData(news as Record<string, unknown>);
          const articleContent = (nd.content as string || '').slice(0, 1500);
          messages.push({
            role: 'user',
            content: `[参考ニュース]\nタイトル: ${nd.title}\n内容: ${articleContent}\n\nこのニュースについて自然に会話してください。`,
          });
        }
      } catch { /* ignore - just chat without article context */ }
    }

    // Set SSE headers
    eggCtx.set('Content-Type', 'text/event-stream');
    eggCtx.set('Cache-Control', 'no-cache');
    eggCtx.set('Connection', 'keep-alive');
    eggCtx.set('X-Accel-Buffering', 'no');

    const stream = new PassThrough();
    eggCtx.body = stream;

    // Build system prompt: Layer1(rules) + soul + memory + level
    const systemPrompt = buildSystemPrompt({
      soul: (friendshipData?.soul as string) || null,
      memory: (friendshipData?.memory as string) || null,
      userLevel: (userData?.jpLevel as string) || undefined,
    });

    let fullResponse = '';

    const writeSSE = (data: Record<string, unknown>) => {
      stream.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Override AI config with selected model's provider and model_id
    const overrideConfig = {
      ...aiConfig,
      [chatModel.provider]: {
        ...aiConfig[chatModel.provider as keyof typeof aiConfig],
        model: chatModel.apiModelId,
      },
    };

    writeSSE({ type: 'start', conversationId });

    try {
      for await (const delta of this.aiService.streamChat(overrideConfig, messages, systemPrompt, chatModel.provider)) {
        fullResponse += delta;
        writeSSE({ type: 'delta', content: delta });
      }

      await this.conversationService.saveMessage(eggCtx, conversationId, 'assistant', fullResponse, 'ja');

      // Deduct credits after successful AI response
      await this.creditService.deductCredits(
        eggCtx, userId,
        chatModel.model.id as string,
        chatModel.creditsPerChat,
        chatModel.isAdmin,
      );

      // Return updated credits in done event
      const creditsInfo = await this.creditService.getCredits(eggCtx, userId);
      writeSSE({ type: 'done', conversationId, credits: creditsInfo.credits });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      writeSSE({ type: 'error', error: errorMessage });
    } finally {
      stream.end();
    }
  }
}
