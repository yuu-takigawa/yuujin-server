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
import { streamProductAIChat, ProductAIConfig } from '../ai/ProductAIService';
import { buildGenerateBioPrompt } from 'yuujin-prompts';
import { PassThrough } from 'stream';

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

    const { system: bioSystemPrompt, user: bioUserPrompt } = buildGenerateBioPrompt({
      name: body.name as string,
      age: body.age,
      gender: body.gender as string,
      occupation: body.occupation as string,
      personality: body.personality as string[] | string,
      hobbies: body.hobbies as string[] | string,
      location: body.location as string,
    });

    // SSE 流式输出
    eggCtx.set('Content-Type', 'text/event-stream');
    eggCtx.set('Cache-Control', 'no-cache');
    eggCtx.set('Connection', 'keep-alive');
    eggCtx.set('X-Accel-Buffering', 'no');

    const stream = new PassThrough();
    eggCtx.body = stream;

    const writeSSE = (data: Record<string, unknown>) => {
      stream.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      writeSSE({ type: 'start' });
      const generator = streamProductAIChat(aiConfig, [{ role: 'user', content: bioUserPrompt }], bioSystemPrompt);
      for await (const delta of generator) {
        writeSSE({ type: 'delta', content: delta });
      }
      writeSSE({ type: 'done' });
    } catch (err) {
      eggCtx.logger.warn('[GenerateBio] AI error:', err);
      writeSSE({ type: 'error', error: 'AI generation failed' });
    } finally {
      stream.end();
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
