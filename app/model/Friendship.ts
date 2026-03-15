import { Bone, Column } from 'leoric';

export default class Friendship extends Bone {
  static table = 'friendships';

  @Column({ primaryKey: true })
  id!: string;

  @Column({ name: 'user_id', allowNull: false })
  userId!: string;

  @Column({ name: 'character_id', allowNull: false })
  characterId!: string;

  @Column({ name: 'is_pinned' })
  isPinned!: number;

  @Column({ name: 'is_muted' })
  isMuted!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
