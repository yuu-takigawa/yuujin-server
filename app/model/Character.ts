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

  @Column({ name: 'prompt_key' })
  promptKey!: string;

  @Column({ name: 'is_preset' })
  isPreset!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
