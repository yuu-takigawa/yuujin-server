import { Bone, Column } from 'leoric';

export default class DeviceToken extends Bone {
  static table = 'device_tokens';

  @Column({ primaryKey: true })
  id!: string;

  @Column({ name: 'user_id', allowNull: false })
  userId!: string;

  @Column({ allowNull: false })
  token!: string;

  @Column({ allowNull: false })
  platform!: string;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
