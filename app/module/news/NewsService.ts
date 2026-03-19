import { ContextProto, AccessLevel } from '@eggjs/tegg';
import { Context } from 'egg';
import { v4 as uuidv4 } from 'uuid';

function boneData(bone: Record<string, unknown>): Record<string, unknown> {
  if (typeof (bone as { getRaw?: Function }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone;
}

@ContextProto({
  accessLevel: AccessLevel.PUBLIC,
})
export class NewsService {
  async list(ctx: Context, options?: { category?: string; limit?: number; offset?: number }) {
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;
    const query: Record<string, unknown> = { status: 'published' };
    if (options?.category) query.category = options.category;

    const articles = await ctx.model.News.find(query)
      .order('published_at DESC')
      .offset(offset)
      .limit(limit + 1);

    const hasMore = articles.length > limit;
    const sliced = hasMore ? articles.slice(0, limit) : articles;

    const mapped = sliced.map((a: Record<string, unknown>) => {
      const data = boneData(a);
      if (typeof data.annotations === 'string') {
        try { data.annotations = JSON.parse(data.annotations as string); } catch { /* ignore */ }
      }
      return data;
    });

    return { articles: mapped, hasMore };
  }

  async getById(ctx: Context, id: string) {
    const article = await ctx.model.News.findOne({ id });
    if (!article) return null;
    const data = boneData(article);
    if (typeof data.annotations === 'string') {
      try { data.annotations = JSON.parse(data.annotations as string); } catch { /* ignore */ }
    }
    return data;
  }

  /** 获取段落注释缓存 */
  async getAnnotationCache(
    ctx: Context,
    newsId: string,
    paragraphIndex: number,
    type: 'translation' | 'explanation',
  ): Promise<string | null> {
    const article = await ctx.model.News.findOne({ id: newsId });
    if (!article) return null;

    const data = boneData(article);
    let annotations: Record<string, unknown>;
    if (typeof data.annotations === 'string') {
      try { annotations = JSON.parse(data.annotations as string); } catch { return null; }
    } else {
      annotations = (data.annotations as Record<string, unknown>) || {};
    }

    const cache = annotations.cache as Record<string, Record<string, string>> | undefined;
    return cache?.[String(paragraphIndex)]?.[type] || null;
  }

  /** 保存段落注释到缓存 */
  async saveAnnotationCache(
    ctx: Context,
    newsId: string,
    paragraphIndex: number,
    type: 'translation' | 'explanation',
    content: string,
  ) {
    const article = await ctx.model.News.findOne({ id: newsId });
    if (!article) return;

    const data = boneData(article);
    let annotations: Record<string, unknown>;
    if (typeof data.annotations === 'string') {
      try { annotations = JSON.parse(data.annotations as string); } catch { annotations = {}; }
    } else {
      annotations = (data.annotations as Record<string, unknown>) || {};
    }

    if (!annotations.cache) annotations.cache = {};
    const cache = annotations.cache as Record<string, Record<string, string>>;
    const key = String(paragraphIndex);
    if (!cache[key]) cache[key] = {};
    cache[key][type] = content;

    await ctx.model.News.update(
      { id: newsId },
      { annotations: JSON.stringify(annotations) },
    );
  }

  async markAsRead(ctx: Context, userId: string, newsId: string) {
    const article = await ctx.model.News.findOne({ id: newsId });
    if (!article) return false;

    const existing = await ctx.model.NewsRead.findOne({ userId, newsId });
    if (existing) return true;

    await ctx.model.NewsRead.create({
      id: uuidv4(),
      userId,
      newsId,
      readAt: new Date(),
    });
    return true;
  }

  async getReadStatus(ctx: Context, userId: string, newsIds: string[]) {
    if (newsIds.length === 0) return {};
    const reads = await ctx.model.NewsRead.find({ userId });
    const readMap: Record<string, boolean> = {};
    for (const r of reads) {
      const data = boneData(r as Record<string, unknown>);
      readMap[data.newsId as string] = true;
    }
    return readMap;
  }

  async seedNews(ctx: Context) {
    for (const article of SEED_NEWS) {
      const existing = await ctx.model.News.findOne({ id: article.id });
      if (existing) continue;
      await ctx.model.News.create({
        ...article,
        annotations: article.annotations,
      });
    }
  }
}

const SEED_NEWS = [
  {
    id: 'news-1',
    title: '東京タワー、開業65周年記念イベントを開催',
    summary: '東京タワーは開業65周年を記念して、特別ライトアップやフォトコンテストなど様々なイベントを開催する。',
    content: '東京タワーは2023年12月23日に開業65周年を迎えた。\n記念イベントとして、特別なライトアップが行われている。毎晩、65周年を象徴する特別なカラーで東京の夜空を彩る。\nまた、来場者向けのフォトコンテストも開催されており、SNSで多くの投稿が寄せられている。',
    imageUrl: '',
    source: 'NHKニュース',
    sourceUrl: '',
    category: 'lifestyle',
    difficulty: '',
    annotations: JSON.stringify({ imageEmoji: '🗼', cache: {} }),
    publishedAt: new Date(Date.now() - 2 * 3600000),
  },
  {
    id: 'news-2',
    title: '新しい日本語能力試験N3対策アプリがリリース',
    summary: 'AI搭載の日本語学習アプリが登場。JLPT N3レベルの文法・語彙をゲーム感覚で学べる。',
    content: '新しいAI搭載の日本語学習アプリ「JapanGo」がリリースされた。\nこのアプリはJLPT N3レベルの文法と語彙をゲーム感覚で学べるのが特徴だ。\nAIが学習者の弱点を分析し、個人に合わせた問題を自動生成する仕組みとなっている。',
    imageUrl: '',
    source: 'テックニュース',
    sourceUrl: '',
    category: 'ai',
    difficulty: '',
    annotations: JSON.stringify({ imageEmoji: '📱', cache: {} }),
    publishedAt: new Date(Date.now() - 5 * 3600000),
  },
  {
    id: 'news-3',
    title: '京都の紅葉シーズン到来、観光客で賑わう',
    summary: '京都の名所で紅葉が見頃を迎え、国内外から多くの観光客が訪れている。清水寺や嵐山が人気。',
    content: '京都の各地で紅葉が見頃を迎えている。\n特に清水寺や嵐山では、鮮やかな赤や黄色に染まった木々が訪れる人々を魅了している。',
    imageUrl: '',
    source: '旅行メディア',
    sourceUrl: '',
    category: 'lifestyle',
    difficulty: '',
    annotations: JSON.stringify({ imageEmoji: '🍁', cache: {} }),
    publishedAt: new Date(Date.now() - 8 * 3600000),
  },
];
