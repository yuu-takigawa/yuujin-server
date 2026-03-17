import { Bone, Column } from 'leoric';

export default class Notification extends Bone {
  static table = 'notifications';

  @Column({ primaryKey: true })
  id!: string;

  @Column({ name: 'user_id', allowNull: false })
  userId!: string;

  @Column({ allowNull: false })
  type!: string;

  @Column({ name: 'entity_type' })
  entityType!: string;

  @Column({ name: 'entity_id' })
  entityId!: string;

  @Column({ name: 'from_user_id' })
  fromUserId!: string;

  @Column({ name: 'from_character_id' })
  fromCharacterId!: string;

  @Column({ name: 'is_read' })
  isRead!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
