import { ContextProto, AccessLevel, Inject } from '@eggjs/tegg';
import { Context } from 'egg';
import { v4 as uuidv4 } from 'uuid';
import { AIService } from '../ai/AIService';

function boneData(bone: Record<string, unknown>): Record<string, unknown> {
  if (typeof (bone as { getRaw?: Function }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone;
}

@ContextProto({
  accessLevel: AccessLevel.PUBLIC,
})
export class FriendService {
  @Inject()
  aiService!: AIService;

  async list(ctx: Context, userId: string) {
    const friendships = await ctx.model.Friendship.find({ userId }).order('is_pinned DESC, created_at ASC');
    const result: Record<string, unknown>[] = [];

    for (const f of friendships) {
      const friendship = boneData(f as Record<string, unknown>);
      const characterId = friendship.characterId as string;

      const character = await ctx.model.Character.findOne({ id: characterId });
      const conversation = await ctx.model.Conversation.findOne({ userId, characterId });

      result.push({
        ...friendship,
        character: character ? boneData(character as Record<string, unknown>) : null,
        conversation: conversation ? boneData(conversation as Record<string, unknown>) : null,
      });
    }

    return result;
  }

  async add(ctx: Context, userId: string, characterId: string) {
    // Check character exists
    const character = await ctx.model.Character.findOne({ id: characterId });
    if (!character) {
      throw new Error('Character not found');
    }

    // Check if already friends
    const existing = await ctx.model.Friendship.findOne({ userId, characterId });
    if (existing) {
      throw new Error('Already friends with this character');
    }

    const charData = boneData(character as Record<string, unknown>);

    // Check user jpLevel for translation
    let userJpLevel = 'N4';
    try {
      const userRecord = await ctx.model.User.findOne({ id: userId });
      if (userRecord) {
        const userData = boneData(userRecord as Record<string, unknown>);
        userJpLevel = (userData.jpLevel as string) || 'N4';
      }
    } catch { /* ignore */ }
    const needsTranslation = !userJpLevel || ['none', 'N5'].includes(userJpLevel);

    // Create friendship，将角色的初始 SOUL 固化到 per-user 关系中
    const friendshipId = uuidv4();
    await ctx.model.Friendship.create({
      id: friendshipId,
      userId,
      characterId,
      isPinned: 0,
      isMuted: 0,
      soul: (charData.initialSoul as string) || null,
    });

    // Create conversation
    const conversationId = uuidv4();
    const bio = (charData.bio as string) || `こんにちは！${charData.name}です。よろしくお願いします！`;
    const now = new Date();

    await ctx.model.Conversation.create({
      id: conversationId,
      userId,
      characterId,
      lastMessage: bio,  // bio 存在 lastMessage，前端 streamText 流式显示
      lastMessageAt: now,
      hasUnread: 1,
    });

    // 不插入 Message — 前端 loadConversation 发现 0 条消息时
    // 会通过 streamText 流式显示 lastMessage（有 typing 动画）
    // streamText 服务端会对 none/N5 用户自动添加中文翻译

    return {
      friendship: { id: friendshipId, userId, characterId, isPinned: 0, isMuted: 0 },
      conversation: { id: conversationId, userId, characterId, lastMessage: bio, lastMessageAt: now, hasUnread: 1 },
      character: charData,
    };
  }

  async remove(ctx: Context, userId: string, characterId: string) {
    const friendship = await ctx.model.Friendship.findOne({ userId, characterId });
    if (!friendship) return false;

    // Delete conversation and its messages (FK cascade handles messages)
    const conversation = await ctx.model.Conversation.findOne({ userId, characterId });
    if (conversation) {
      const convData = boneData(conversation as Record<string, unknown>);
      await ctx.model.Message.remove({ conversationId: convData.id });
      await ctx.model.Conversation.remove({ id: convData.id });
    }

    await ctx.model.Friendship.remove({ userId, characterId });
    return true;
  }

  async update(ctx: Context, userId: string, characterId: string, input: { isPinned?: number; isMuted?: number }) {
    const friendship = await ctx.model.Friendship.findOne({ userId, characterId });
    if (!friendship) return null;

    const updates: Record<string, unknown> = {};
    if (input.isPinned !== undefined) updates.isPinned = input.isPinned;
    if (input.isMuted !== undefined) updates.isMuted = input.isMuted;

    const friendData = boneData(friendship as Record<string, unknown>);
    await ctx.model.Friendship.update({ id: friendData.id }, updates);

    const updated = await ctx.model.Friendship.findOne({ userId, characterId });
    return updated ? boneData(updated as Record<string, unknown>) : null;
  }
}
