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
  async list(ctx: Context, options?: { category?: string; difficulty?: string; limit?: number; offset?: number }) {
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;
    let query: Record<string, unknown> = { status: 'published' };
    if (options?.category) query.category = options.category;
    if (options?.difficulty) query.difficulty = options.difficulty;

    const articles = await ctx.model.News.find(query)
      .order('published_at DESC')
      .offset(offset)
      .limit(limit + 1); // 多取一条用于判断 hasMore

    const hasMore = articles.length > limit;
    const sliced = hasMore ? articles.slice(0, limit) : articles;

    const mapped = sliced.map((a: Record<string, unknown>) => {
      const data = boneData(a);
      // Parse annotations JSON if stored as string
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

  async markAsRead(ctx: Context, userId: string, newsId: string) {
    // Check if article exists
    const article = await ctx.model.News.findOne({ id: newsId });
    if (!article) return false;

    // Idempotent: check existing
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
    content: '',
    imageUrl: '',
    source: 'NHKニュース',
    sourceUrl: '',
    category: 'culture',
    difficulty: 'N4',
    annotations: JSON.stringify({
      imageEmoji: '🗼',
      paragraphs: [
        {
          id: 'p1-1',
          text: '東京タワーは2023年12月23日に開業65周年を迎えた。',
          ruby: [['東京', 'とうきょう'], ['開業', 'かいぎょう'], ['周年', 'しゅうねん'], ['迎', 'むか']],
          translation: 'Tokyo Tower celebrated its 65th anniversary on December 23, 2023.',
          explanation: '「迎えた」(むかえた) means "welcomed/reached". The past tense of 迎える. 「開業65周年」means "65th anniversary of opening".',
        },
        {
          id: 'p1-2',
          text: '記念イベントとして、特別なライトアップが行われている。毎晩、65周年を象徴する特別なカラーで東京の夜空を彩る。',
          ruby: [['記念', 'きねん'], ['特別', 'とくべつ'], ['行', 'おこな'], ['毎晩', 'まいばん'], ['象徴', 'しょうちょう'], ['夜空', 'よぞら'], ['彩', 'いろど']],
          translation: 'As a commemorative event, a special light-up is being held. Every night, it colors Tokyo\'s night sky with special colors symbolizing the 65th anniversary.',
          explanation: '「行われている」is passive progressive form of 行う (to carry out). 「彩る」(いろどる) means "to color/decorate".',
        },
        {
          id: 'p1-3',
          text: 'また、来場者向けのフォトコンテストも開催されており、SNSで多くの投稿が寄せられている。',
          ruby: [['来場者', 'らいじょうしゃ'], ['向', 'む'], ['開催', 'かいさい'], ['多', 'おお'], ['投稿', 'とうこう'], ['寄', 'よ']],
          translation: 'Additionally, a photo contest for visitors is being held, and many posts are being submitted on social media.',
          explanation: '「来場者向け」means "for visitors". 「寄せられている」is passive progressive of 寄せる (to send/submit).',
        },
      ],
      comments: [
        { id: 'c1-1', characterId: 'preset-sato-yuki', characterName: '佐藤ゆき', characterEmoji: '👩', content: 'わー、65周年なんだ！今度行ってみたいな〜📸' },
        { id: 'c1-2', characterId: 'preset-tanaka-kenta', characterName: '田中健太', characterEmoji: '👨', content: '東京タワーのライトアップ、技術的に面白いんですよ。LEDの制御システムが最新なんです。' },
      ],
    }),
    publishedAt: new Date(Date.now() - 2 * 3600000),
  },
  {
    id: 'news-2',
    title: '新しい日本語能力試験N3対策アプリがリリース',
    summary: 'AI搭載の日本語学習アプリが登場。JLPT N3レベルの文法・語彙をゲーム感覚で学べる。',
    content: '',
    imageUrl: '',
    source: 'テックニュース',
    sourceUrl: '',
    category: 'technology',
    difficulty: 'N3',
    annotations: JSON.stringify({
      imageEmoji: '📱',
      paragraphs: [
        {
          id: 'p2-1',
          text: '新しいAI搭載の日本語学習アプリ「JapanGo」がリリースされた。',
          ruby: [['新', 'あたら'], ['搭載', 'とうさい'], ['学習', 'がくしゅう']],
          translation: 'A new AI-powered Japanese learning app "JapanGo" has been released.',
          explanation: '「搭載」(とうさい) means "equipped with/loaded with". 「リリースされた」is the passive form indicating it was released.',
        },
        {
          id: 'p2-2',
          text: 'このアプリはJLPT N3レベルの文法と語彙をゲーム感覚で学べるのが特徴だ。',
          ruby: [['文法', 'ぶんぽう'], ['語彙', 'ごい'], ['感覚', 'かんかく'], ['学', 'まな'], ['特徴', 'とくちょう']],
          translation: 'The app features the ability to learn JLPT N3 level grammar and vocabulary in a game-like way.',
          explanation: '「ゲーム感覚で」means "in a game-like manner". 「〜のが特徴だ」is a pattern meaning "the characteristic is that~".',
        },
        {
          id: 'p2-3',
          text: 'AIが学習者の弱点を分析し、個人に合わせた問題を自動生成する仕組みとなっている。',
          ruby: [['学習者', 'がくしゅうしゃ'], ['弱点', 'じゃくてん'], ['分析', 'ぶんせき'], ['個人', 'こじん'], ['合', 'あ'], ['問題', 'もんだい'], ['自動', 'じどう'], ['生成', 'せいせい'], ['仕組', 'しく']],
          translation: 'It works by having AI analyze learners\' weaknesses and automatically generating personalized questions.',
          explanation: '「仕組みとなっている」means "it is structured/designed as". 「個人に合わせた」means "personalized/tailored to the individual".',
        },
      ],
      comments: [
        { id: 'c2-1', characterId: 'preset-tanaka-kenta', characterName: '田中健太', characterEmoji: '👨', content: 'AIで語学学習か。技術的にどうやって弱点分析してるのか気になるな。' },
        { id: 'c2-2', characterId: 'preset-yamamoto-sakura', characterName: '山本さくら', characterEmoji: '👧', content: '生徒さんにも勧めてみようかな。ゲーム感覚で学べるのはいいですね。' },
      ],
    }),
    publishedAt: new Date(Date.now() - 5 * 3600000),
  },
  {
    id: 'news-3',
    title: '京都の紅葉シーズン到来、観光客で賑わう',
    summary: '京都の名所で紅葉が見頃を迎え、国内外から多くの観光客が訪れている。清水寺や嵐山が人気。',
    content: '',
    imageUrl: '',
    source: '朝日新聞',
    sourceUrl: '',
    category: 'travel',
    difficulty: 'N4',
    annotations: JSON.stringify({
      imageEmoji: '🍁',
      paragraphs: [
        {
          id: 'p3-1',
          text: '京都の各地で紅葉が見頃を迎えている。',
          ruby: [['京都', 'きょうと'], ['各地', 'かくち'], ['紅葉', 'こうよう'], ['見頃', 'みごろ'], ['迎', 'むか']],
          translation: 'Autumn leaves are reaching their peak across Kyoto.',
          explanation: '「見頃を迎えている」means "reaching the best time to see". 「各地で」means "in various places".',
        },
        {
          id: 'p3-2',
          text: '特に清水寺や嵐山では、鮮やかな赤や黄色に染まった木々が訪れる人々を魅了している。',
          ruby: [['特', 'とく'], ['鮮', 'あざ'], ['赤', 'あか'], ['黄色', 'きいろ'], ['染', 'そ'], ['木々', 'きぎ'], ['訪', 'おとず'], ['人々', 'ひとびと'], ['魅了', 'みりょう']],
          translation: 'Especially at Kiyomizu-dera and Arashiyama, trees dyed in vivid reds and yellows are captivating visitors.',
          explanation: '「染まった」means "dyed/colored". 「魅了している」means "captivating/fascinating".',
        },
      ],
      comments: [
        { id: 'c3-1', characterId: 'preset-yamamoto-sakura', characterName: '山本さくら', characterEmoji: '👧', content: '京都の紅葉は本当に美しいです。清水寺からの眺めは格別ですよ。' },
        { id: 'c3-2', characterId: 'preset-sato-yuki', characterName: '佐藤ゆき', characterEmoji: '👩', content: '紅葉の写真撮りに行きたい！京都のカフェも巡りたいな〜🍁' },
      ],
    }),
    publishedAt: new Date(Date.now() - 8 * 3600000),
  },
  {
    id: 'news-4',
    title: '日本のアニメ産業、過去最高の売上を記録',
    summary: '日本動画協会の最新レポートによると、アニメ産業の市場規模が過去最高を更新した。',
    content: '',
    imageUrl: '',
    source: 'アニメニュース',
    sourceUrl: '',
    category: 'entertainment',
    difficulty: 'N3',
    annotations: JSON.stringify({
      imageEmoji: '🎬',
      paragraphs: [],
      comments: [],
    }),
    publishedAt: new Date(Date.now() - 24 * 3600000),
  },
  {
    id: 'news-5',
    title: '新幹線の新型車両N700S、全路線に導入完了',
    summary: 'JR東海は最新型新幹線N700Sの全路線導入が完了したと発表。省エネ性能が大幅に向上。',
    content: '',
    imageUrl: '',
    source: '鉄道ジャーナル',
    sourceUrl: '',
    category: 'technology',
    difficulty: 'N3',
    annotations: JSON.stringify({
      imageEmoji: '🚄',
      paragraphs: [],
      comments: [],
    }),
    publishedAt: new Date(Date.now() - 24 * 3600000),
  },
  {
    id: 'news-6',
    title: '和食がユネスコ無形文化遺産登録10周年',
    summary: '和食のユネスコ無形文化遺産登録から10周年を迎え、各地で記念イベントが開催されている。',
    content: '',
    imageUrl: '',
    source: '読売新聞',
    sourceUrl: '',
    category: 'culture',
    difficulty: 'N4',
    annotations: JSON.stringify({
      imageEmoji: '🍣',
      paragraphs: [],
      comments: [],
    }),
    publishedAt: new Date(Date.now() - 48 * 3600000),
  },
];
