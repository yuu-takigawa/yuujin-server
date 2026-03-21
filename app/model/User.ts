import { Bone, Column, DataTypes } from 'leoric';

export default class User extends Bone {
  static table = 'users';

  @Column({ primaryKey: true })
  id!: string;

  @Column({ allowNull: false })
  email!: string;

  @Column()
  phone!: string;

  @Column({ name: 'password_hash', allowNull: false })
  passwordHash!: string;

  @Column({ allowNull: false })
  name!: string;

  @Column({ name: 'avatar_url' })
  avatarUrl!: string;

  @Column({ name: 'avatar_emoji' })
  avatarEmoji!: string;

  @Column({ name: 'jp_level' })
  jpLevel!: string;

  @Column()
  membership!: string;

  @Column()
  credits!: number;

  @Column({ name: 'credits_reset_at' })
  creditsResetAt!: Date;

  @Column({ type: DataTypes.JSON })
  settings!: object;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
