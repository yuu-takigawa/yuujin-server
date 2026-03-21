import * as dotenv from 'dotenv';
import * as mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { yukiSoul, kentaSoul, sakuraSoul, renSoul, mioSoul } from 'yuujin-prompts';

dotenv.config();

const PRESET_CHARACTERS = [
  {
    id: 'preset-sato-yuki',
    name: '佐藤ゆき',
    avatar_url: '',
    age: 22,
    gender: 'female',
    occupation: 'カフェ店員',
    personality: JSON.stringify(['明るい', '優しい', '話好き']),
    hobbies: JSON.stringify(['カフェ巡り', '写真撮影', 'スイーツ作り']),
    location: '東京・下北沢',
    bio: '下北沢のカフェで気づいたら3年目。昨日お客さんの犬にラテアート褒められた（犬に）。散歩と写真が好きで、スマホの容量はいつも空の写真でパンパン。甘いもの一緒に食べに行かない？',
    initial_soul: yukiSoul,
    is_preset: 1,
    display_order: 1,
  },
  {
    id: 'preset-suzuki-mio',
    name: '鈴木 みお',
    avatar_url: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/girl-06.png',
    age: 20,
    gender: 'female',
    occupation: '大学生（中国語専攻）',
    personality: JSON.stringify(['明るい', 'おしゃべり', '大阪人気質', '共感力高い']),
    hobbies: JSON.stringify(['中国ドラマ', '食べ歩き', 'カラオケ', '中国語学習']),
    location: '大阪',
    bio: '大阪の大学で中国語勉強してる！去年上海に留学してから完全にハマった。声調むずすぎるけど頑張ってる。麻辣香鍋と周杰倫の「晴天」が最近のブーム。お互い言葉教え合おうや！',
    initial_soul: mioSoul,
    is_preset: 1,
    display_order: 2,
  },
  {
    id: 'preset-tanaka-kenta',
    name: '田中健太',
    avatar_url: '',
    age: 28,
    gender: 'male',
    occupation: 'エンジニア',
    personality: JSON.stringify(['真面目', '親切', 'オタク気質']),
    hobbies: JSON.stringify(['プログラミング', 'アニメ', 'ゲーム']),
    location: '東京・秋葉原',
    bio: '秋葉原のIT企業で毎日コード書いてる。先週バグ修正に3日かかって発狂しかけた。アニメは今期だけで12本追ってる。推しキャラの話始めると止まらないから気をつけて。',
    initial_soul: kentaSoul,
    is_preset: 1,
    display_order: 3,
  },
  {
    id: 'preset-yamamoto-sakura',
    name: '山本さくら',
    avatar_url: '',
    age: 35,
    gender: 'female',
    occupation: '日本語教師',
    personality: JSON.stringify(['知的', '穏やか', '忍耐強い']),
    hobbies: JSON.stringify(['読書', '茶道', '旅行']),
    location: '京都',
    bio: '京都で日本語を教えて10年。先月の茶道のお稽古で正座しすぎて立てなくなった。旅先では必ず古本屋に寄る癖がある。日本のこと、何でも聞いてくださいね。',
    initial_soul: sakuraSoul,
    is_preset: 1,
    display_order: 4,
  },
  {
    id: 'preset-nakamura-ren',
    name: '中村 蓮',
    avatar_url: 'https://yuujin-assets.oss-cn-hangzhou.aliyuncs.com/avatars/presets/boy-04.png',
    age: 31,
    gender: 'male',
    occupation: 'バーテンダー',
    personality: JSON.stringify(['クール', '聞き上手', '寡黙だけど的確']),
    hobbies: JSON.stringify(['ウイスキー', '音楽', 'バイク', '映画']),
    location: '東京・中目黒',
    bio: '中目黒の路地裏で小さなバーをやってる。看板なし、カウンター8席。元バンドマン。ラフロイグとChet Bakerがあればだいたい機嫌がいい。話、聞くよ。',
    initial_soul: renSoul,
    is_preset: 1,
    display_order: 5,
  },
];

const SEED_NEWS = [
  {
    id: 'news-1',
    title: '東京タワー、開業65周年記念イベントを開催',
    summary: '東京タワーは開業65周年を記念して、特別ライトアップやフォトコンテストなど様々なイベントを開催する。',
    content: '',
    image_url: '',
    source: 'NHKニュース',
    source_url: '',
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
    published_at: new Date(Date.now() - 2 * 3600000).toISOString().slice(0, 19).replace('T', ' '),
  },
  {
    id: 'news-2',
    title: '新しい日本語能力試験N3対策アプリがリリース',
    summary: 'AI搭載の日本語学習アプリが登場。JLPT N3レベルの文法・語彙をゲーム感覚で学べる。',
    content: '',
    image_url: '',
    source: 'テックニュース',
    source_url: '',
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
    published_at: new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 19).replace('T', ' '),
  },
  {
    id: 'news-3',
    title: '京都の紅葉シーズン到来、観光客で賑わう',
    summary: '京都の名所で紅葉が見頃を迎え、国内外から多くの観光客が訪れている。清水寺や嵐山が人気。',
    content: '',
    image_url: '',
    source: '朝日新聞',
    source_url: '',
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
    published_at: new Date(Date.now() - 8 * 3600000).toISOString().slice(0, 19).replace('T', ' '),
  },
  {
    id: 'news-4',
    title: '日本のアニメ産業、過去最高の売上を記録',
    summary: '日本動画協会の最新レポートによると、アニメ産業の市場規模が過去最高を更新した。',
    content: '',
    image_url: '',
    source: 'アニメニュース',
    source_url: '',
    category: 'entertainment',
    difficulty: 'N3',
    annotations: JSON.stringify({ imageEmoji: '🎬', paragraphs: [], comments: [] }),
    published_at: new Date(Date.now() - 24 * 3600000).toISOString().slice(0, 19).replace('T', ' '),
  },
  {
    id: 'news-5',
    title: '新幹線の新型車両N700S、全路線に導入完了',
    summary: 'JR東海は最新型新幹線N700Sの全路線導入が完了したと発表。省エネ性能が大幅に向上。',
    content: '',
    image_url: '',
    source: '鉄道ジャーナル',
    source_url: '',
    category: 'technology',
    difficulty: 'N3',
    annotations: JSON.stringify({ imageEmoji: '🚄', paragraphs: [], comments: [] }),
    published_at: new Date(Date.now() - 24 * 3600000).toISOString().slice(0, 19).replace('T', ' '),
  },
  {
    id: 'news-6',
    title: '和食がユネスコ無形文化遺産登録10周年',
    summary: '和食のユネスコ無形文化遺産登録から10周年を迎え、各地で記念イベントが開催されている。',
    content: '',
    image_url: '',
    source: '読売新聞',
    source_url: '',
    category: 'culture',
    difficulty: 'N4',
    annotations: JSON.stringify({ imageEmoji: '🍣', paragraphs: [], comments: [] }),
    published_at: new Date(Date.now() - 48 * 3600000).toISOString().slice(0, 19).replace('T', ' '),
  },
];

async function seed() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'yuujin',
    password: process.env.MYSQL_PASSWORD || 'yuujin123',
    database: process.env.MYSQL_DATABASE || 'yuujin',
    charset: 'utf8mb4',
  });

  console.log('Connected to MySQL. Seeding preset characters...');

  for (const char of PRESET_CHARACTERS) {
    // Idempotent: check if already exists
    const [rows] = await connection.execute(
      'SELECT id FROM characters WHERE id = ?',
      [char.id],
    );

    if ((rows as any[]).length > 0) {
      console.log(`  ✓ ${char.name} already exists, skipping.`);
      continue;
    }

    await connection.execute(
      `INSERT INTO characters (id, user_id, name, avatar_url, age, gender, occupation, personality, hobbies, location, bio, initial_soul, is_preset)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        char.id,
        char.name,
        char.avatar_url,
        char.age,
        char.gender,
        char.occupation,
        char.personality,
        char.hobbies,
        char.location,
        char.bio,
        char.initial_soul,
        char.is_preset,
      ],
    );
    console.log(`  + ${char.name} inserted.`);
  }

  console.log('Seeding news articles...');

  for (const article of SEED_NEWS) {
    const [rows] = await connection.execute(
      'SELECT id FROM news WHERE id = ?',
      [article.id],
    );

    if ((rows as any[]).length > 0) {
      console.log(`  ✓ ${article.title.slice(0, 20)}... already exists, skipping.`);
      continue;
    }

    await connection.execute(
      `INSERT INTO news (id, title, summary, content, image_url, source, source_url, category, difficulty, annotations, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        article.id,
        article.title,
        article.summary,
        article.content,
        article.image_url,
        article.source,
        article.source_url,
        article.category,
        article.difficulty,
        article.annotations,
        article.published_at,
      ],
    );
    console.log(`  + ${article.title.slice(0, 20)}... inserted.`);
  }

  console.log('Seed complete!');
  await connection.end();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
