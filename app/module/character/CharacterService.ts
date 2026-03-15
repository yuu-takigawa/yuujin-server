import { ContextProto, AccessLevel } from '@eggjs/tegg';
import { Context } from 'egg';
import { v4 as uuidv4 } from 'uuid';

function boneData(bone: Record<string, unknown>): Record<string, unknown> {
  if (typeof (bone as { getRaw?: Function }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone;
}

export interface CreateCharacterInput {
  name: string;
  avatarUrl?: string;
  age?: number;
  gender?: string;
  occupation?: string;
  personality?: string[];
  hobbies?: string[];
  location?: string;
  bio?: string;
  promptKey?: string;
}

const PRESET_CHARACTERS: (CreateCharacterInput & { id: string })[] = [
  {
    id: 'preset-sato-yuki',
    name: '佐藤ゆき',
    avatarUrl: '',
    age: 22,
    gender: 'female',
    occupation: 'カフェ店員',
    personality: ['明るい', '優しい', '話好き'],
    hobbies: ['カフェ巡り', '写真撮影', 'スイーツ作り'],
    location: '東京・下北沢',
    bio: 'はじめまして！佐藤ゆきです。下北沢のカフェで働いています。おしゃべりが大好きで、いろんな話をするのが楽しみです。日本語の練習、一緒に頑張りましょう！気軽に話しかけてくださいね。',
    promptKey: 'sato_yuki',
  },
  {
    id: 'preset-tanaka-kenta',
    name: '田中健太',
    avatarUrl: '',
    age: 28,
    gender: 'male',
    occupation: 'エンジニア',
    personality: ['真面目', '親切', 'オタク気質'],
    hobbies: ['プログラミング', 'アニメ', 'ゲーム'],
    location: '東京・秋葉原',
    bio: 'やあ！田中健太です。IT企業でエンジニアをしています。アニメやゲームが好きで、秋葉原によく行きます。技術の話からサブカルの話まで、何でも話しましょう！日本語、一緒に楽しく学びましょう。',
    promptKey: 'tanaka_kenta',
  },
  {
    id: 'preset-yamamoto-sakura',
    name: '山本さくら',
    avatarUrl: '',
    age: 35,
    gender: 'female',
    occupation: '日本語教師',
    personality: ['知的', '穏やか', '忍耐強い'],
    hobbies: ['読書', '茶道', '旅行'],
    location: '京都',
    bio: 'こんにちは、山本さくらと申します。京都で日本語を教えています。日本の文化や歴史が大好きです。茶道も少し嗜んでいます。ゆっくり丁寧にお話ししますので、安心してくださいね。一緒に日本語を楽しみましょう。',
    promptKey: 'yamamoto_sakura',
  },
];

@ContextProto({
  accessLevel: AccessLevel.PUBLIC,
})
export class CharacterService {
  async list(ctx: Context, userId: string) {
    const characters = await ctx.model.Character.find({
      $or: [{ isPreset: 1 }, { userId }],
    }).order('is_preset DESC, created_at ASC');
    return characters.map((c: Record<string, unknown>) => boneData(c));
  }

  async create(ctx: Context, userId: string, input: CreateCharacterInput) {
    const id = uuidv4();
    await ctx.model.Character.create({
      id,
      userId,
      name: input.name,
      avatarUrl: input.avatarUrl || '',
      age: input.age,
      gender: input.gender,
      occupation: input.occupation || '',
      personality: input.personality || [],
      hobbies: input.hobbies || [],
      location: input.location || '',
      bio: input.bio || '',
      promptKey: input.promptKey || '',
      isPreset: 0,
    });
    const created = await ctx.model.Character.findOne({ id });
    return created ? boneData(created) : { id, ...input };
  }

  async getById(ctx: Context, id: string) {
    const character = await ctx.model.Character.findOne({ id });
    return character ? boneData(character) : null;
  }

  async update(ctx: Context, id: string, userId: string, input: Partial<CreateCharacterInput>) {
    const character = await ctx.model.Character.findOne({ id, userId, isPreset: 0 });
    if (!character) return null;

    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.avatarUrl !== undefined) updates.avatarUrl = input.avatarUrl;
    if (input.age !== undefined) updates.age = input.age;
    if (input.gender !== undefined) updates.gender = input.gender;
    if (input.occupation !== undefined) updates.occupation = input.occupation;
    if (input.personality !== undefined) updates.personality = input.personality;
    if (input.hobbies !== undefined) updates.hobbies = input.hobbies;
    if (input.location !== undefined) updates.location = input.location;
    if (input.bio !== undefined) updates.bio = input.bio;
    if (input.promptKey !== undefined) updates.promptKey = input.promptKey;

    await ctx.model.Character.update({ id }, updates);
    const updated = await ctx.model.Character.findOne({ id });
    return updated ? boneData(updated) : null;
  }

  async delete(ctx: Context, id: string, userId: string) {
    const character = await ctx.model.Character.findOne({ id, userId, isPreset: 0 });
    if (!character) return false;
    await ctx.model.Character.remove({ id });
    return true;
  }

  async seedPresets(ctx: Context) {
    for (const preset of PRESET_CHARACTERS) {
      const existing = await ctx.model.Character.findOne({ id: preset.id });
      if (existing) continue;
      await ctx.model.Character.create({
        id: preset.id,
        userId: null,
        name: preset.name,
        avatarUrl: preset.avatarUrl || '',
        age: preset.age,
        gender: preset.gender,
        occupation: preset.occupation || '',
        personality: preset.personality || [],
        hobbies: preset.hobbies || [],
        location: preset.location || '',
        bio: preset.bio || '',
        promptKey: preset.promptKey || '',
        isPreset: 1,
      });
    }
  }
}
