import { Bone, Column, DataTypes } from 'leoric';

export default class Message extends Bone {
  static table = 'messages';

  @Column({ primaryKey: true })
  id!: string;

  @Column({ name: 'conversation_id', allowNull: false })
  conversationId!: string;

  @Column({ allowNull: false })
  role!: string;

  @Column({ allowNull: false })
  content!: string;

  @Column()
  language!: string;

  @Column({ type: DataTypes.JSON })
  metadata!: object;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
