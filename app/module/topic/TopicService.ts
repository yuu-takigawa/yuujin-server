/**
 * TopicService — AI 话题抽卡
 *
 * 基于角色 memory + 近期新闻 + 对话历史，让 ProductAI 生成 5 张话题卡。
 * 每次调用都动态生成，不做缓存（保证新鲜感）。
 */

import { ContextProto, AccessLevel } from '@eggjs/tegg';
import { Context } from 'egg';
import { productAIChat, ProductAIConfig } from '../ai/ProductAIService';

export interface TopicCard {
  id: string;
  text: string;
  emoji: string;
}

function boneData(bone: unknown): Record<string, unknown> {
  if (bone && typeof (bone as { getRaw?: () => Record<string, unknown> }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone as Record<string, unknown>;
}

@ContextProto({
  accessLevel: AccessLevel.PUBLIC,
})
export class TopicService {
  async draw(ctx: Context, userId: string, characterId: string): Promise<TopicCard[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aiConfig: ProductAIConfig = (ctx.app.config as any).bizConfig?.productAi;

    // 1. 加载角色信息
    const charRow = await ctx.model.Character.findOne({ id: characterId });
    if (!charRow) throw new Error('Character not found');
    const character = boneData(charRow);

    // 2. 加载 friendship memory
    const friendRow = await ctx.model.Friendship.findOne({ userId, characterId });
    const friendship = friendRow ? boneData(friendRow) : null;
    const memory = (friendship?.memory as string) || null;

    // 3. 最近对话的最后几条消息
    const convRow = await ctx.model.Conversation.findOne({ userId, characterId });
    let recentDialog = '';
    if (convRow) {
      const conv = boneData(convRow);
      const recentMessages = await ctx.model.Message.find({
        conversationId: conv.id,
      }).order('created_at DESC').limit(6);

      recentDialog = (recentMessages as unknown[])
        .map(boneData)
        .reverse()
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => `[${m.role === 'user' ? 'ユーザー' : character.name}]: ${(m.content as string).slice(0, 100)}`)
        .join('\n');
    }

    // 4. 近期新闻标题（3条）
    const newsRows = await ctx.model.News.find({})
      .order('published_at DESC')
      .limit(3);
    const newsHeadlines = (newsRows as unknown[])
      .map(boneData)
      .map((n) => `・${n.title}`)
      .join('\n');

    // 5. 调用 ProductAI
    const systemPrompt = `あなたは会話話題生成AIです。与えられた情報をもとに、キャラクターとユーザーの自然な会話のきっかけになる話題カードを生成してください。`;

    const userPrompt = `
キャラクター: ${character.name}（${character.occupation || ''}、${character.location || ''}）
${memory ? `キャラクターのユーザーへの記憶:\n${memory}` : '（まだ深い交流はない）'}

最近の会話:
${recentDialog || '（まだ会話がない）'}

今日のニュース:
${newsHeadlines || '（なし）'}

上記をふまえて、このユーザーと ${character.name} が自然に話せる話題を5つ提案してください。
話題は具体的で会話が広がりやすいものにしてください。

以下のJSON配列形式で返してください（必ず5つ）:
[
  { "text": "話題の短いテキスト（20字以内）", "emoji": "絵文字1つ" },
  ...
]

JSONのみ返してください。`.trim();

    let topics: TopicCard[] = [];

    try {
      const response = await productAIChat(
        aiConfig,
        [{ role: 'user', content: userPrompt }],
        systemPrompt,
      );

      const match = response.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]) as Array<{ text: string; emoji: string }>;
        topics = parsed.slice(0, 5).map((t, i) => ({
          id: `topic-${Date.now()}-${i}`,
          text: t.text || '',
          emoji: t.emoji || '💬',
        }));
      }
    } catch {
      // fallback topics
    }

    // 如果 AI 失败，返回基础 fallback
    if (topics.length === 0) {
      topics = DEFAULT_TOPICS.map((t, i) => ({
        id: `topic-fallback-${i}`,
        text: t.text,
        emoji: t.emoji,
      }));
    }

    return topics;
  }
}

const DEFAULT_TOPICS = [
  { text: '最近何してた？', emoji: '😊' },
  { text: '好きな食べ物は？', emoji: '🍜' },
  { text: '休日の過ごし方', emoji: '🌿' },
  { text: '最近見た映画やドラマ', emoji: '🎬' },
  { text: '今日のニュースについて', emoji: '📰' },
];
