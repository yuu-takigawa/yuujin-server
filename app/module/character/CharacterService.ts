import { ContextProto, AccessLevel } from '@eggjs/tegg';
import { Context } from 'egg';
import { v4 as uuidv4 } from 'uuid';
import { buildCustomCharacterPrompt, yukiSoul, kentaSoul, sakuraSoul, renSoul, mioSoul } from 'yuujin-prompts';

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
}

const PRESET_CHARACTERS = [
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
    initialSoul: yukiSoul,
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
    initialSoul: kentaSoul,
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
    initialSoul: sakuraSoul,
  },
  {
    id: 'preset-nakamura-ren',
    name: '中村 蓮',
    avatarUrl: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/boy-04.png',
    age: 31,
    gender: 'male',
    occupation: 'バーテンダー',
    personality: ['クール', '聞き上手', '寡黙だけど的確'],
    hobbies: ['ウイスキー', '音楽', 'バイク', '映画'],
    location: '東京・中目黒',
    bio: '中目黒の路地裏で小さなバーをやってる。看板なし、カウンター8席。元バンドマン。ラフロイグとChet Bakerがあればだいたい機嫌がいい。話、聞くよ。',
    initialSoul: renSoul,
  },
  {
    id: 'preset-suzuki-mio',
    name: '鈴木 みお',
    avatarUrl: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/girl-06.png',
    age: 20,
    gender: 'female',
    occupation: '大学生（中国語専攻）',
    personality: ['明るい', 'おしゃべり', '大阪人気質', '共感力高い'],
    hobbies: ['中国ドラマ', '食べ歩き', 'カラオケ', '中国語学習'],
    location: '大阪',
    bio: '大阪の大学で中国語勉強してる！去年上海に留学してから完全にハマった。声調むずすぎるけど頑張ってる。麻辣香鍋と周杰倫の「晴天」が最近のブーム。お互い言葉教え合おうや！',
    initialSoul: mioSoul,
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
    // 自定义角色：用表单字段生成初始 SOUL
    const initialSoul = buildCustomCharacterPrompt(input) + '\n\n## 今のこの人との関係\n初めて話した新しい友達。まだよく知らないが、一緒に日本語の練習ができることを楽しみにしている。';
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
      initialSoul,
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
        initialSoul: preset.initialSoul,
        isPreset: 1,
      });
    }
  }
}
