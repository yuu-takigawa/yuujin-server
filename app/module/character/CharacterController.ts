import {
  HTTPController,
  HTTPMethod,
  HTTPMethodEnum,
  HTTPParam,
  Inject,
  Context,
} from '@eggjs/tegg';
import { EggContext } from '@eggjs/tegg';
import { Context as EggCtx } from 'egg';
import { CharacterService } from './CharacterService';
import { productAIChat, ProductAIConfig } from '../ai/ProductAIService';

@HTTPController({
  path: '/characters',
})
export class CharacterController {
  @Inject()
  characterService!: CharacterService;

  @HTTPMethod({
    method: HTTPMethodEnum.GET,
    path: '/',
  })
  async list(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const characters = await this.characterService.list(eggCtx, userId);
    return { success: true, data: characters };
  }

  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/',
  })
  async create(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const body = eggCtx.request.body as Record<string, unknown>;

    if (!body.name) {
      eggCtx.status = 400;
      return { success: false, error: 'name is required' };
    }

    const character = await this.characterService.create(eggCtx, userId, {
      name: body.name as string,
      avatarUrl: body.avatarUrl as string | undefined,
      age: body.age as number | undefined,
      gender: body.gender as string | undefined,
      occupation: body.occupation as string | undefined,
      personality: body.personality as string[] | undefined,
      hobbies: body.hobbies as string[] | undefined,
      location: body.location as string | undefined,
      bio: body.bio as string | undefined,
    });
    return { success: true, data: character };
  }

  /** POST /characters/generate-bio  body: { name, age, gender, occupation, personality, hobbies, location } */
  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/generate-bio',
  })
  async generateBio(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const body = eggCtx.request.body as Record<string, unknown>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aiConfig: ProductAIConfig = (eggCtx.app.config as any).bizConfig?.productAi;
    if (!aiConfig) {
      eggCtx.status = 500;
      return { success: false, error: 'AI service not configured' };
    }

    const prompt = `以下のキャラクター情報に基づいて、自然で魅力的な自己紹介文を日本語で1つ書いてください。
100〜150字程度で、そのキャラクターらしい口調で。自己紹介文のみ出力してください。

名前: ${body.name || '不明'}
年齢: ${body.age || '不明'}
性別: ${body.gender || '不明'}
職業: ${body.occupation || '不明'}
性格: ${Array.isArray(body.personality) ? body.personality.join('、') : body.personality || '不明'}
趣味: ${Array.isArray(body.hobbies) ? body.hobbies.join('、') : body.hobbies || '不明'}
住所: ${body.location || '不明'}`;

    try {
      const bio = await productAIChat(aiConfig, [{ role: 'user', content: prompt }]);
      return { success: true, data: { bio: bio.trim() } };
    } catch (err) {
      eggCtx.logger.warn('[GenerateBio] AI error:', err);
      eggCtx.status = 500;
      return { success: false, error: 'AI generation failed' };
    }
  }

  @HTTPMethod({
    method: HTTPMethodEnum.GET,
    path: '/:id',
  })
  async get(@Context() ctx: EggContext, @HTTPParam() id: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const character = await this.characterService.getById(eggCtx, id);
    if (!character) {
      eggCtx.status = 404;
      return { success: false, error: 'Character not found' };
    }
    return { success: true, data: character };
  }

  @HTTPMethod({
    method: HTTPMethodEnum.PUT,
    path: '/:id',
  })
  async update(@Context() ctx: EggContext, @HTTPParam() id: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const body = eggCtx.request.body as Record<string, unknown>;

    const character = await this.characterService.update(eggCtx, id, userId, {
      name: body.name as string | undefined,
      avatarUrl: body.avatarUrl as string | undefined,
      age: body.age as number | undefined,
      gender: body.gender as string | undefined,
      occupation: body.occupation as string | undefined,
      personality: body.personality as string[] | undefined,
      hobbies: body.hobbies as string[] | undefined,
      location: body.location as string | undefined,
      bio: body.bio as string | undefined,
    });

    if (!character) {
      eggCtx.status = 404;
      return { success: false, error: 'Character not found or not editable' };
    }
    return { success: true, data: character };
  }

  @HTTPMethod({
    method: HTTPMethodEnum.DELETE,
    path: '/:id',
  })
  async delete(@Context() ctx: EggContext, @HTTPParam() id: string) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const deleted = await this.characterService.delete(eggCtx, id, userId);
    if (!deleted) {
      eggCtx.status = 404;
      return { success: false, error: 'Character not found or not deletable' };
    }
    return { success: true };
  }
}
