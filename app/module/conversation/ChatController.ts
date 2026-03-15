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
      modelId?: string;
      newsRef?: string;
      topicRef?: string;
    };
    const { conversationId, message, modelId, newsRef, topicRef } = body;
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
      chatModel = await this.creditService.validateChatCredits(eggCtx, userId, modelId);
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

    // Detect language of user message
    const language = detectLanguage(message);

    // Build metadata
    const metadata: Record<string, unknown> = {};
    if (newsRef) metadata.newsRef = newsRef;
    if (topicRef) metadata.topicRef = topicRef;
    if (modelId) metadata.modelId = modelId;

    // Save user message
    await this.conversationService.saveMessage(
      eggCtx, conversationId, 'user', message,
      language !== 'unknown' ? language : undefined,
      Object.keys(metadata).length > 0 ? metadata : undefined,
    );

    // Load conversation history
    const history = await this.conversationService.getMessages(eggCtx, conversationId);
    const messages: ChatMessage[] = history.map((m: Record<string, unknown>) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content as string,
    }));

    // Set SSE headers
    eggCtx.set('Content-Type', 'text/event-stream');
    eggCtx.set('Cache-Control', 'no-cache');
    eggCtx.set('Connection', 'keep-alive');
    eggCtx.set('X-Accel-Buffering', 'no');

    const stream = new PassThrough();
    eggCtx.body = stream;

    // Build character-aware system prompt
    const systemPrompt = buildSystemPrompt({
      character: charData ? {
        name: charData.name as string,
        promptKey: (charData.promptKey as string) || undefined,
        age: charData.age as number | undefined,
        gender: charData.gender as string | undefined,
        occupation: charData.occupation as string | undefined,
        personality: charData.personality as string[] | undefined,
        hobbies: charData.hobbies as string[] | undefined,
        location: charData.location as string | undefined,
        bio: charData.bio as string | undefined,
      } : undefined,
      userLevel: (userData?.jpLevel as string) || undefined,
      newsRef,
      topicRef,
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
