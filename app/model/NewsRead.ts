import { Bone, Column } from 'leoric';

export default class NewsRead extends Bone {
  static table = 'news_reads';

  @Column({ primaryKey: true })
  id!: string;

  @Column({ name: 'user_id', allowNull: false })
  userId!: string;

  @Column({ name: 'news_id', allowNull: false })
  newsId!: string;

  @Column({ name: 'read_at' })
  readAt!: Date;
}
