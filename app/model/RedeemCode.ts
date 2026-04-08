import { Bone, Column, DataTypes } from 'leoric';

export default class RedeemCode extends Bone {
  static table = 'redeem_codes';

  @Column({ primaryKey: true })
  id!: string;

  @Column({ allowNull: false })
  code!: string;

  @Column({ type: DataTypes.JSON, allowNull: false })
  reward!: object;

  @Column({ name: 'max_uses', allowNull: false })
  maxUses!: number;

  @Column({ name: 'used_count', allowNull: false })
  usedCount!: number;

  @Column({ name: 'expires_at' })
  expiresAt!: Date;

  @Column({ name: 'is_active' })
  isActive!: number;

  @Column()
  description!: string;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
