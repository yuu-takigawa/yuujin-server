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

  /** 角色对本用户的灵魂状态（AI 生成，随对话演化） */
  @Column()
  soul!: string;

  /** 角色对本用户的记忆摘要（AI 生成，随对话演化） */
  @Column()
  memory!: string;

  /** 上次 GrowthEngine 运行时间 */
  @Column({ name: 'last_growth_at' })
  lastGrowthAt!: Date;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
