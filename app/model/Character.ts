import { Bone, Column, DataTypes } from 'leoric';

export default class Character extends Bone {
  static table = 'characters';

  @Column({ primaryKey: true })
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ allowNull: false })
  name!: string;

  @Column({ name: 'avatar_url' })
  avatarUrl!: string;

  @Column()
  age!: number;

  @Column()
  gender!: string;

  @Column()
  occupation!: string;

  @Column({ type: DataTypes.JSON })
  personality!: object;

  @Column({ type: DataTypes.JSON })
  hobbies!: object;

  @Column()
  location!: string;

  @Column()
  bio!: string;

  /** 角色初始灵魂：加好友时写入 friendship.soul 的起始值 */
  @Column({ name: 'initial_soul' })
  initialSoul!: string;

  @Column({ name: 'is_preset' })
  isPreset!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
