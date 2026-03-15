import { Bone, Column } from 'leoric';

export default class Conversation extends Bone {
  static table = 'conversations';

  @Column({ primaryKey: true })
  id!: string;

  @Column({ name: 'user_id', allowNull: false })
  userId!: string;

  @Column({ name: 'character_id', allowNull: false })
  characterId!: string;

  @Column({ name: 'last_message' })
  lastMessage!: string;

  @Column({ name: 'last_message_at' })
  lastMessageAt!: Date;

  @Column({ name: 'has_unread' })
  hasUnread!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
