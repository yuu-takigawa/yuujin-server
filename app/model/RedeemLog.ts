import { Bone, Column, DataTypes } from 'leoric';

export default class RedeemLog extends Bone {
  static table = 'redeem_logs';

  @Column({ primaryKey: true })
  id!: string;

  @Column({ name: 'user_id', allowNull: false })
  userId!: string;

  @Column({ name: 'redeem_code_id', allowNull: false })
  redeemCodeId!: string;

  @Column({ type: DataTypes.JSON, allowNull: false })
  reward!: object;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
