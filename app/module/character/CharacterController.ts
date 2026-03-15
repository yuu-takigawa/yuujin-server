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
      promptKey: body.promptKey as string | undefined,
    });
    return { success: true, data: character };
  }

  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/generate',
  })
  async generate(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    eggCtx.status = 501;
    return { success: false, error: 'AI character generation not yet implemented' };
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
      promptKey: body.promptKey as string | undefined,
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
