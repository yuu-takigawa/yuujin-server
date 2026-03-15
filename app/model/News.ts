import { Bone, Column, DataTypes } from 'leoric';

export default class News extends Bone {
  static table = 'news';

  @Column({ primaryKey: true })
  id!: string;

  @Column({ allowNull: false })
  title!: string;

  @Column()
  summary!: string;

  @Column({ allowNull: false })
  content!: string;

  @Column({ name: 'image_url' })
  imageUrl!: string;

  @Column()
  source!: string;

  @Column({ name: 'source_url' })
  sourceUrl!: string;

  @Column()
  category!: string;

  @Column()
  difficulty!: string;

  @Column({ type: DataTypes.JSON })
  annotations!: object;

  @Column({ name: 'published_at' })
  publishedAt!: Date;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
