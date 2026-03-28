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

const ANNOTATE_PROMPTS: Record<string, (content: string, jpLevel?: string) => string> = {
  translation: (content) => `将以下日语翻译成中文，只输出翻译结果：\n${content}`,
  analysis: (content, jpLevel) => {
    const useChineseExplanation = !jpLevel || ['none', 'N5'].includes(jpLevel);
    return useChineseExplanation
      ? `用中文简洁解析以下日语的语法要点，3行以内，不要翻译原文：\n${content}`
      : `以下の日本語の文法ポイントを3行以内で簡潔に解説してください。翻訳は不要です。\n${content}`;
  },
  correction: (content) => `纠正以下日语中的语法错误，指出错误并给出正确写法：\n${content}`,
};

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
      imageUrl?: string;
    };
    const { conversationId, message, imageUrl } = body;
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

    // Save user message (store imageUrl in metadata if present)
    await this.conversationService.saveMessage(
      eggCtx, conversationId, 'user', message,
      language !== 'unknown' ? language : undefined,
      imageUrl ? { imageUrl } : undefined,
    );

    // Load conversation history
    const { messages: history } = await this.conversationService.getMessages(eggCtx, conversationId);
    const messages: ChatMessage[] = history.map((m: Record<string, unknown>) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content as string,
    }));

    // Inject image context for vision AI
    if (imageUrl) {
      messages.push({
        role: 'user',
        content: `[画像が送信されました]\nURL: ${imageUrl}\n\nこの画像について日本語で自然にコメントしてください。`,
      });
    }

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
            content: `[参考ニュース]\nタイトル: ${nd.title}\n内容: ${articleContent}\n\nこのニュースについて感想や意見を4文以内で短くコメントして。長文禁止、簡潔に。`,
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

  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/chat/suggest',
  })
  async suggest(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const body = eggCtx.request.body as { conversationId?: string };
    const { conversationId } = body;
    const aiConfig = eggCtx.app.config.bizConfig.ai;

    if (!conversationId) {
      eggCtx.status = 400;
      eggCtx.body = { error: 'conversationId is required' };
      return;
    }

    // Verify conversation ownership
    const conversation = await this.conversationService.getById(eggCtx, conversationId, userId);
    if (!conversation) {
      eggCtx.status = 404;
      eggCtx.body = { error: 'Conversation not found' };
      return;
    }

    // Load recent messages (last 5)
    const { messages: history } = await this.conversationService.getMessages(eggCtx, conversationId, 5);
    const messages: ChatMessage[] = history.map((m: Record<string, unknown>) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content as string,
    }));

    if (messages.length === 0) {
      eggCtx.status = 400;
      eggCtx.body = { error: 'No messages in conversation' };
      return;
    }

    // Set SSE headers
    eggCtx.set('Content-Type', 'text/event-stream');
    eggCtx.set('Cache-Control', 'no-cache');
    eggCtx.set('Connection', 'keep-alive');
    eggCtx.set('X-Accel-Buffering', 'no');

    const stream = new PassThrough();
    eggCtx.body = stream;

    const writeSSE = (data: Record<string, unknown>) => {
      stream.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Check user jpLevel for translation hints
    let jpLevel: string | undefined;
    try {
      const user = await eggCtx.model.User.findOne({ id: userId });
      if (user) {
        const ud = boneData(user as Record<string, unknown>);
        jpLevel = (ud.jpLevel as string) || undefined;
      }
    } catch { /* ignore */ }
    const needsTranslation = !jpLevel || ['none', 'N5'].includes(jpLevel);

    // Use cheap model (qianwen turbo)
    const provider = 'qianwen';
    const overrideConfig = {
      ...aiConfig,
      [provider]: {
        ...aiConfig[provider as keyof typeof aiConfig],
        model: 'qwen-turbo-latest',
      },
    };

    const suggestSystemPrompt = needsTranslation
      ? '以下の会話の続きとして、学習者が送りそうな自然な日本語の返事を1〜2文で提案してください。各文の後に括弧で短い中国語訳を添えてください。例: 今日はいい天気ですね！（今天天气真好！）返事のみ出力し、説明は不要です。'
      : '以下の会話の続きとして、学習者が送りそうな自然な日本語の返事を1〜2文で提案してください。返事のみ出力し、説明は不要です。';

    writeSSE({ type: 'start', conversationId });

    try {
      for await (const delta of this.aiService.streamChat(overrideConfig, messages, suggestSystemPrompt, provider)) {
        writeSSE({ type: 'delta', content: delta });
      }
      // No credits deduction, no message saving
      writeSSE({ type: 'done', conversationId });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      writeSSE({ type: 'error', error: errorMessage });
    } finally {
      stream.end();
    }
  }

  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/chat/annotate',
  })
  async annotate(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const body = eggCtx.request.body as {
      content?: string;
      type?: string;
    };
    const { content, type } = body;

    if (!content || !type) {
      eggCtx.status = 400;
      eggCtx.body = { error: 'content and type are required' };
      return;
    }

    const promptBuilder = ANNOTATE_PROMPTS[type];
    if (!promptBuilder) {
      eggCtx.status = 400;
      eggCtx.body = { error: 'type must be one of: translation, analysis, correction' };
      return;
    }

    // Get user jpLevel for language-appropriate analysis
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    let jpLevel: string | undefined;
    try {
      const user = await eggCtx.model.User.findOne({ id: userId });
      if (user) {
        const ud = boneData(user as Record<string, unknown>);
        jpLevel = (ud.jpLevel as string) || undefined;
      }
    } catch { /* ignore */ }

    const aiConfig = eggCtx.app.config.bizConfig.ai;

    // Use a cheap model (qianwen flash)
    const provider = 'qianwen';
    const overrideConfig = {
      ...aiConfig,
      [provider]: {
        ...aiConfig[provider as keyof typeof aiConfig],
        model: 'qwen-turbo-latest',
      },
    };

    // Set SSE headers
    eggCtx.set('Content-Type', 'text/event-stream');
    eggCtx.set('Cache-Control', 'no-cache');
    eggCtx.set('Connection', 'keep-alive');
    eggCtx.set('X-Accel-Buffering', 'no');

    const stream = new PassThrough();
    eggCtx.body = stream;

    const writeSSE = (data: Record<string, unknown>) => {
      stream.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const userPrompt = promptBuilder(content, jpLevel);
    const messages: ChatMessage[] = [{ role: 'user', content: userPrompt }];

    writeSSE({ type: 'start' });

    try {
      for await (const delta of this.aiService.streamChat(overrideConfig, messages, undefined, provider)) {
        writeSSE({ type: 'delta', content: delta });
      }
      writeSSE({ type: 'done' });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      writeSSE({ type: 'error', error: errorMessage });
    } finally {
      stream.end();
    }
  }

  /**
   * POST /chat/greet — 新好友第一条消息（SSE 流式）
   *
   * 前端 loadConversation 检测 0 消息后调用。
   * 服务端：取角色 bio → N5 用户翻译 → SSE 逐字流式返回 → 持久化 Message。
   */
  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/chat/greet',
  })
  async greet(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const body = eggCtx.request.body as { conversationId?: string };

    if (!body.conversationId) {
      eggCtx.status = 400;
      return { success: false, error: 'conversationId required' };
    }

    const conv = await eggCtx.model.Conversation.findOne({ id: body.conversationId, userId });
    if (!conv) {
      eggCtx.status = 404;
      return { success: false, error: 'Conversation not found' };
    }
    const convData = conv.getRaw ? conv.getRaw() : conv;
    const characterId = convData.characterId as string;

    // 检查是否已有消息（防重复调用）
    const existingMsgs = await eggCtx.model.Message.find({ conversationId: body.conversationId }).limit(1);
    if ((existingMsgs as unknown[]).length > 0) {
      eggCtx.status = 200;
      return { success: true, data: { skipped: true } };
    }

    const character = await eggCtx.model.Character.findOne({ id: characterId });
    if (!character) {
      eggCtx.status = 404;
      return { success: false, error: 'Character not found' };
    }
    const charData = character.getRaw ? character.getRaw() : character;
    let bio = (charData.bio as string) || `こんにちは！${charData.name}です。よろしくお願いします！`;

    // 检查用户 jpLevel
    let userJpLevel = 'N4';
    try {
      const userRecord = await eggCtx.model.User.findOne({ id: userId });
      if (userRecord) {
        const ud = userRecord.getRaw ? userRecord.getRaw() : userRecord;
        userJpLevel = (ud.jpLevel as string) || 'N4';
      }
    } catch { /* ignore */ }

    // N5/none 用户：翻译 bio
    const needsTranslation = !userJpLevel || ['none', 'N5'].includes(userJpLevel);
    if (needsTranslation && !bio.includes('（')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aiConfig = (eggCtx.app as any).config?.bizConfig?.ai;
        if (aiConfig) {
          const translated = await this.aiService.chat(aiConfig, [{ role: 'user', content: bio }],
            '以下の日本語テキストを、各文の後ろに括弧で中国語訳を付けて返してください。例: こんにちは！（你好！）よろしくお願いします！（请多多关照！）\n元のテキストの改行や構造はそのまま維持してください。翻訳以外は何も出力しないでください。',
            'qianwen',
          );
          if (translated?.trim()) bio = translated.trim();
        }
      } catch { /* 翻译失败用原始 bio */ }
    }

    // SSE headers
    eggCtx.set('Content-Type', 'text/event-stream');
    eggCtx.set('Cache-Control', 'no-cache');
    eggCtx.set('Connection', 'keep-alive');
    eggCtx.set('X-Accel-Buffering', 'no');

    const stream = new PassThrough();
    eggCtx.body = stream;

    // 逐字流式返回
    const writeSSE = (data: Record<string, unknown>) => {
      stream.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    writeSSE({ type: 'start', conversationId: body.conversationId });

    for (let i = 0; i < bio.length; i++) {
      writeSSE({ type: 'delta', content: bio[i] });
    }

    // 持久化到 DB
    const { v4: uuidv4 } = await import('uuid');
    const messageId = uuidv4();
    try {
      await eggCtx.model.Message.create({
        id: messageId,
        conversationId: body.conversationId,
        role: 'assistant',
        content: bio,
        language: 'ja',
      });
      await eggCtx.model.Conversation.update({ id: body.conversationId }, { lastMessage: bio });
    } catch { /* silent */ }

    writeSSE({ type: 'done', conversationId: body.conversationId });
    stream.end();
  }
}
