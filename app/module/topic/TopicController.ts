import {
  HTTPController,
  HTTPMethod,
  HTTPMethodEnum,
  Inject,
  Context,
} from '@eggjs/tegg';
import { EggContext } from '@eggjs/tegg';
import { Context as EggCtx } from 'egg';
import { TopicService } from './TopicService';

@HTTPController({
  path: '/topics',
})
export class TopicController {
  @Inject()
  topicService!: TopicService;

  /** POST /topics/draw  body: { characterId } — get pre-generated topics */
  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/draw',
  })
  async draw(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const body = eggCtx.request.body as { characterId?: string };

    if (!body.characterId) {
      eggCtx.status = 400;
      return { success: false, error: 'characterId is required' };
    }

    try {
      const topics = await this.topicService.draw(eggCtx, userId, body.characterId);
      return { success: true, data: topics };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to draw topics';
      eggCtx.status = 500;
      return { success: false, error: message };
    }
  }

  /** POST /topics/shuffle  body: { characterId } — AI generates 1 new topic (costs credits) */
  @HTTPMethod({
    method: HTTPMethodEnum.POST,
    path: '/shuffle',
  })
  async shuffle(@Context() ctx: EggContext) {
    const eggCtx = ctx as unknown as EggCtx;
    const userId = (eggCtx as Record<string, unknown>).userId as string;
    const body = eggCtx.request.body as { characterId?: string };

    if (!body.characterId) {
      eggCtx.status = 400;
      return { success: false, error: 'characterId is required' };
    }

    try {
      const topic = await this.topicService.shuffle(eggCtx, userId, body.characterId);
      return { success: true, data: topic };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to shuffle topic';
      eggCtx.status = 500;
      return { success: false, error: message };
    }
  }
}
