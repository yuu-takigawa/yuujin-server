import { Bone, Column } from 'leoric';

export default class MembershipPlan extends Bone {
  static table = 'membership_plans';

  @Column({ primaryKey: true })
  id!: string;

  @Column({ allowNull: false })
  tier!: string;

  @Column({ allowNull: false })
  name!: string;

  @Column({ name: 'price_monthly' })
  priceMonthly!: number;

  @Column({ name: 'daily_credits' })
  dailyCredits!: number;

  @Column()
  description!: string;

  @Column({ name: 'is_active' })
  isActive!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
