import { Bone, Column } from 'leoric';

export default class CreditLog extends Bone {
  static table = 'credit_logs';

  @Column({ primaryKey: true })
  id!: string;

  @Column({ name: 'user_id', allowNull: false })
  userId!: string;

  @Column({ allowNull: false })
  amount!: number;

  @Column({ allowNull: false })
  type!: string;

  @Column()
  description!: string;

  @Column({ name: 'model_id' })
  modelId!: string;

  @Column({ name: 'balance_after', allowNull: false })
  balanceAfter!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
