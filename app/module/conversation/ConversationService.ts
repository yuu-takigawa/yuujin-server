import { ContextProto, AccessLevel } from '@eggjs/tegg';
import { Context } from 'egg';
import { v4 as uuidv4 } from 'uuid';

function boneData(bone: Record<string, unknown>): Record<string, unknown> {
  if (typeof (bone as { getRaw?: Function }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone;
}

@ContextProto({
  accessLevel: AccessLevel.PUBLIC,
})
export class ConversationService {
  async getMessages(ctx: Context, conversationId: string, limit = 50) {
    const messages = await ctx.model.Message.find({
      conversationId,
    }).order('created_at ASC').limit(limit);
    return messages.map((m: Record<string, unknown>) => boneData(m));
  }

  async saveMessage(ctx: Context, conversationId: string, role: string, content: string, language?: string, metadata?: object) {
    const id = uuidv4();
    const createData: Record<string, unknown> = {
      id,
      conversationId,
      role,
      content,
    };
    if (language) createData.language = language;
    if (metadata) createData.metadata = metadata;

    await ctx.model.Message.create(createData);

    // Sync update conversation last_message fields
    const now = new Date();
    await ctx.model.Conversation.update(
      { id: conversationId },
      {
        lastMessage: content.slice(0, 500),
        lastMessageAt: now,
        hasUnread: role === 'assistant' ? 1 : 0,
      },
    );

    return { id, conversationId, role, content, language };
  }

  async list(ctx: Context, userId: string) {
    // Join with friendships for pinned sorting
    const conversations = await ctx.model.Conversation.find({
      userId,
    }).order('created_at DESC');

    const results: Record<string, unknown>[] = [];
    for (const c of conversations) {
      const conv = boneData(c as Record<string, unknown>);
      const characterId = conv.characterId as string;

      // Check if pinned via friendship
      const friendship = await ctx.model.Friendship.findOne({ userId, characterId });
      const friendData = friendship ? boneData(friendship as Record<string, unknown>) : null;
      const character = await ctx.model.Character.findOne({ id: characterId });
      const charData = character ? boneData(character as Record<string, unknown>) : null;

      results.push({
        ...conv,
        isPinned: friendData ? friendData.isPinned : 0,
        character: charData,
      });
    }

    // Sort: pinned first, then by last_message_at DESC
    results.sort((a, b) => {
      const pinnedDiff = (b.isPinned as number || 0) - (a.isPinned as number || 0);
      if (pinnedDiff !== 0) return pinnedDiff;
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt as string).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt as string).getTime() : 0;
      return bTime - aTime;
    });

    return results;
  }

  async getById(ctx: Context, id: string, userId: string) {
    const conv = await ctx.model.Conversation.findOne({ id, userId });
    return conv ? boneData(conv) : null;
  }

  async delete(ctx: Context, id: string, userId: string) {
    const conv = await ctx.model.Conversation.findOne({ id, userId });
    if (!conv) return false;
    await ctx.model.Message.remove({ conversationId: id });
    await ctx.model.Conversation.remove({ id });
    return true;
  }

  async markAsRead(ctx: Context, id: string, userId: string) {
    const conv = await ctx.model.Conversation.findOne({ id, userId });
    if (!conv) return false;
    await ctx.model.Conversation.update({ id }, { hasUnread: 0 });
    return true;
  }

  async clearMessages(ctx: Context, conversationId: string, userId: string) {
    const conv = await ctx.model.Conversation.findOne({ id: conversationId, userId });
    if (!conv) return false;
    await ctx.model.Message.remove({ conversationId });
    await ctx.model.Conversation.update({ id: conversationId }, {
      lastMessage: null,
      lastMessageAt: null,
    });
    return true;
  }

  async search(ctx: Context, conversationId: string, userId: string, keyword: string) {
    // Verify ownership
    const conv = await ctx.model.Conversation.findOne({ id: conversationId, userId });
    if (!conv) return null;

    const messages = await ctx.model.Message.find({
      conversationId,
    }).order('created_at ASC');

    const filtered = messages
      .map((m: Record<string, unknown>) => boneData(m))
      .filter((m: Record<string, unknown>) => {
        const content = m.content as string;
        return content.toLowerCase().includes(keyword.toLowerCase());
      });

    return filtered;
  }
}
