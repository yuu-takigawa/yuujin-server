import { Bone, Column } from 'leoric';

export default class AiModel extends Bone {
  static table = 'ai_models';

  @Column({ primaryKey: true })
  id!: string;

  @Column({ allowNull: false })
  name!: string;

  @Column({ allowNull: false })
  provider!: string;

  @Column({ name: 'model_id', allowNull: false })
  modelId!: string;

  @Column({ name: 'credits_per_chat', allowNull: false })
  creditsPerChat!: number;

  @Column({ name: 'min_tier', allowNull: false })
  minTier!: string;

  @Column({ name: 'display_order' })
  displayOrder!: number;

  @Column({ name: 'is_active' })
  isActive!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
