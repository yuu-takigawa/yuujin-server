import { Bone, Column } from 'leoric';

export default class VerificationCode extends Bone {
  static table = 'verification_codes';

  @Column({ primaryKey: true, autoIncrement: true })
  id!: number;

  @Column({ allowNull: false })
  email!: string;

  @Column({ allowNull: false })
  code!: string;

  @Column({ allowNull: false })
  type!: string;

  @Column({ name: 'expires_at', allowNull: false })
  expiresAt!: Date;

  @Column({ defaultValue: 0 })
  used!: number;

  @Column({ defaultValue: 0 })
  attempts!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
