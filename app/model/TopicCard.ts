import { Bone, Column } from 'leoric';

export default class TopicCard extends Bone {
  static table = 'topic_cards';

  @Column({ primaryKey: true })
  id!: string;

  @Column({ name: 'character_id', allowNull: false })
  characterId!: string;

  @Column({ name: 'user_id', allowNull: false })
  userId!: string;

  @Column({ allowNull: false })
  text!: string;

  @Column()
  emoji!: string;

  @Column()
  used!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
