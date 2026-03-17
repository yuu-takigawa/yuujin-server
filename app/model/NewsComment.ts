import { Bone, Column, DataTypes } from 'leoric';

export default class NewsComment extends Bone {
  static table = 'news_comments';

  @Column({ primaryKey: true })
  id!: string;

  @Column({ name: 'news_id', allowNull: false })
  newsId!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'character_id' })
  characterId!: string;

  @Column({ name: 'parent_id' })
  parentId!: string;

  @Column({ allowNull: false })
  content!: string;

  @Column({ type: DataTypes.JSON })
  mentions!: Array<{ type: 'character' | 'user'; id: string; name: string }>;

  @Column({ name: 'is_ai' })
  isAi!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
