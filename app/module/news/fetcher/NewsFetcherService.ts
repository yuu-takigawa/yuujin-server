/**
 * NewsFetcherService — 自动抓取日本新闻
 *
 * 来源（5 垂直源，不含综合/社会/政治新闻）:
 *   1. ITmedia AI+（AI・IT 话题）
 *   2. ナタリー 音楽（音乐新闻）
 *   3. ナタリー コミック（漫画・动画新闻）
 *   4. Gizmodo Japan（科技・数码）
 *   5. Lifehacker Japan（生活技巧）
 *
 * 流程:
 *   抓取 RSS/Atom → 去重 → 标题黑名单过滤 → 全文+OG 图 → 图片转存 OSS → 存 DB
 */

import { v4 as uuidv4 } from 'uuid';
import { OSSService, OSSConfig } from '../../avatar/OSSService';

export interface RawArticle {
  title: string;
  summary: string;
  content: string;
  sourceUrl: string;
  source: string;
  imageUrl: string;
  publishedAt: Date;
  category: string;
}

// ─── RSS/RDF/Atom XML パーサー ──────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const patterns = [
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i'),
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'),
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (m) return m[1].trim();
  }
  return '';
}

interface FeedItem {
  title: string; link: string; description: string;
  pubDate: string; enclosure: string; category: string;
}

/** RSS 2.0 / RDF 1.0 parser */
function parseRSSItems(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];
    const enclosureMatch = block.match(/<enclosure[^>]+url="([^"]+)"/i);
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'dc:date');
    items.push({
      title: extractTag(block, 'title'),
      link: extractTag(block, 'link'),
      description: extractTag(block, 'description') || extractTag(block, 'content:encoded'),
      pubDate,
      enclosure: enclosureMatch?.[1] || '',
      category: extractTag(block, 'category'),
    });
  }
  return items;
}

/** Atom 1.0 parser（ナタリー等で使用） */
function parseAtomEntries(xml: string): FeedItem[] {
  const entries: FeedItem[] = [];
  const entryRe = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;
  while ((match = entryRe.exec(xml)) !== null) {
    const block = match[1];
    const linkMatch = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
      || block.match(/<link[^>]*href=["']([^"']+)["']/i);
    entries.push({
      title: extractTag(block, 'title'),
      link: linkMatch?.[1] || '',
      description: extractTag(block, 'summary') || extractTag(block, 'content'),
      pubDate: extractTag(block, 'published') || extractTag(block, 'updated'),
      enclosure: '',
      category: extractTag(block, 'category'),
    });
  }
  return entries;
}

/** 统一解析 RSS/Atom */
function parseFeedItems(xml: string): FeedItem[] {
  const rssItems = parseRSSItems(xml);
  if (rssItems.length > 0) return rssItems;
  return parseAtomEntries(xml);
}

// ─── HTTP ヘルパー ──────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Yuujin-NewsBot/1.0)' },
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

// ─── 标题关键词黑名单（内容安全）──────────────────────────────────────────

const TITLE_BLACKLIST = [
  // 暴力・犯罪
  /死亡/, /死者/, /殺人/, /逮捕/, /容疑者?/, /遺体/, /行方不明/,
  /事故死/, /自殺/, /暴行/, /強盗/, /詐欺被害/,
  // 政治・国際紛争
  /首相/, /大統領/, /総理大臣/, /外務省/, /防衛省/,
  /国会/, /選挙/, /政党/, /与党/, /野党/,
  // 軍事
  /ミサイル/, /核実験/, /軍事/, /空爆/, /戦争/,
  // 中国市場向けセンシティブ
  /習近平/, /天安門/, /チベット独立/, /台湾独立/, /ウイグル/,
  // 災害（大規模）
  /震度[5-7]/, /津波警報/, /大規模噴火/,
];

function isTitleBlacklisted(title: string): boolean {
  return TITLE_BLACKLIST.some(re => re.test(title));
}

// ─── 源ページ解析（全文 + OG画像を1回の fetch で取得）─────────────────────────

interface PageData {
  body: string;
  ogImage: string;
}

/** 非正文パターン — ナビ、広告、シェアボタン等 */
const GARBAGE_PATTERNS = [
  /console\.log/,
  /googletag/,
  /JavaScript.*無効/,
  /JavaScriptの設定を/,
  /メールでシェアする/,
  /Facebookでシェアする/,
  /Xでシェアする/,
  /はてなブックマーク/,
  /シェアする.*シェアする/,
  /cookie/i,
  /プライバシーポリシー.*利用規約/,
  /^\[?PR\]?$/,
  /無断転載禁止/,
  /All Rights Reserved/i,
  /著作権.*帰属/,
  /記事についての報告/,
  /おすすめ記事/,
  /関連ニュース/,
  /もっと見る/,
  /^写真[:：]|^出典[:：]/,
  /ログイン.*新規登録/,
  /アプリで開く/,
  /コメント\d+件/,
  /この記事についてツイート/,
  /^提供[:：]/,
  /^配信[:：]/,
  /^最終更新[:：]/,
  /PR\s*TIMES/i,
  /プレスリリース/,
  /^広告$/,
  /^AD$/i,
  /^sponsored/i,
  /^PR$/,
  /記事提供[:：]/,
  /外部サイト/,
  /^この記事は.*提供/,
  /^©\s*\d{4}/,
  /copyright/i,
  /転載.*禁止/,
  /続きを読む/,
  /^購読/,
  /メルマガ/,
  /^キーワード[:：]/,
  /^タグ[:：]/,
  /有料会員/,
  /有料記事/,
  /会員限定/,
  /月額.*円/,
  /無料会員登録/,
  /残り\d+文字/,
  /全文を読む/,
  /続きは有料/,
  /ここから先は/,
  /^ログインして/,
  /会員登録すると/,
];

function isGarbageText(text: string): boolean {
  return GARBAGE_PATTERNS.some(re => re.test(text));
}

async function fetchPageData(url: string): Promise<PageData> {
  try {
    const res = await fetchWithTimeout(url, 10000);
    if (!res.ok) return { body: '', ogImage: '' };
    const html = await res.text();

    // --- OG Image ---
    let ogImage = '';
    const headHtml = html.slice(0, 30000);
    const ogMatch = headHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || headHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) ogImage = ogMatch[1];
    if (!ogImage) {
      const twMatch = headHtml.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
        || headHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
      if (twMatch?.[1]) ogImage = twMatch[1];
    }

    // --- 正文提取 ---
    let cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    const articleMatch = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const contentHtml = articleMatch ? articleMatch[1] : cleaned;

    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m: RegExpExecArray | null;
    while ((m = pRegex.exec(contentHtml)) !== null) {
      const text = m[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/&#\d+;/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length >= 15 && !isGarbageText(text)) paragraphs.push(text);
    }

    // 末尾广告段落清洗
    const tailGarbageRe = /PR|広告|配信|©|copyright|提供|転載|All Rights Reserved|プレスリリース|有料|残り\d+文字|全文を読む|続きは有料|ここから先は|無料会員登録|月額.*円/i;
    while (paragraphs.length > 0) {
      const last = paragraphs[paragraphs.length - 1];
      if (last.length < 80 && tailGarbageRe.test(last)) {
        paragraphs.pop();
      } else {
        break;
      }
    }

    return { body: paragraphs.join('\n'), ogImage };
  } catch {
    return { body: '', ogImage: '' };
  }
}

// ─── 新闻源定义 ──────────────────────────────────────────────────────

interface FeedSource {
  name: string;
  url: string;
  category: string;
  maxItems: number;
}

const FEED_SOURCES: FeedSource[] = [
  { name: 'ITmedia AI+', url: 'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml', category: 'ai', maxItems: 8 },
  { name: 'ナタリー 音楽', url: 'https://natalie.mu/music/feed/news', category: 'music', maxItems: 8 },
  { name: 'ナタリー コミック', url: 'https://natalie.mu/comic/feed/news', category: 'comic', maxItems: 8 },
  { name: 'Gizmodo Japan', url: 'https://www.gizmodo.jp/index.xml', category: 'tech', maxItems: 8 },
  { name: 'Lifehacker Japan', url: 'https://www.lifehacker.jp/feed/index.xml', category: 'lifestyle', maxItems: 8 },
];

async function fetchFeed(source: FeedSource): Promise<RawArticle[]> {
  try {
    const res = await fetchWithTimeout(source.url);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseFeedItems(xml).slice(0, source.maxItems).map((item) => ({
      title: item.title,
      summary: item.description.replace(/<[^>]+>/g, '').slice(0, 200),
      content: item.description.replace(/<[^>]+>/g, '') || item.title,
      sourceUrl: item.link,
      source: source.name,
      imageUrl: item.enclosure || '',
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      category: source.category,
    }));
  } catch {
    return [];
  }
}

// ─── 画像 → OSS 転送 ────────────────────────────────────────────────────────

async function mirrorImageToOSS(
  imageUrl: string,
  articleId: string,
  oss: OSSService,
): Promise<string> {
  try {
    const res = await fetchWithTimeout(imageUrl, 10000);
    if (!res.ok) return '';
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    if (buf.length < 1000 || buf.length > 5_000_000) return '';

    const ext = contentType.includes('png') ? 'png'
      : contentType.includes('webp') ? 'webp'
      : 'jpg';
    const key = `news/${articleId}.${ext}`;
    const result = await oss.upload(key, buf, contentType);
    return result.url;
  } catch {
    return '';
  }
}

// ─── カテゴリ絵文字 ──────────────────────────────────────────────────────

function categoryEmoji(category: string): string {
  const map: Record<string, string> = {
    ai: '🤖', music: '🎵', comic: '📚', tech: '💻', lifestyle: '✨',
  };
  return map[category] || '📰';
}

// ─── メインサービス ──────────────────────────────────────────────────────────

export class NewsFetcherService {
  static MIN_CONTENT_LENGTH = 200;
  static MAX_CONTENT_LENGTH = 3000;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async fetchAll(ctx: any, ossConfig?: OSSConfig): Promise<{ inserted: number; skipped: number; enriched: number }> {
    const results = await Promise.allSettled(
      FEED_SOURCES.map(source => fetchFeed(source)),
    );

    const articles: RawArticle[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') articles.push(...r.value);
    }

    const oss = ossConfig?.accessKeyId ? new OSSService(ossConfig) : null;
    let inserted = 0;
    let skipped = 0;
    let enriched = 0;

    for (const article of articles) {
      if (!article.title || !article.sourceUrl) { skipped++; continue; }

      // 标题黑名单过滤
      if (isTitleBlacklisted(article.title)) { skipped++; continue; }

      const existing = await ctx.model.News.findOne({ sourceUrl: article.sourceUrl });
      if (existing) { skipped++; continue; }

      const id = uuidv4();

      let content = article.content || article.title;
      let summary = article.summary || '';
      let imageUrl = '';

      try {
        const page = await fetchPageData(article.sourceUrl);
        if (page.body.length > content.length) {
          content = page.body;
          summary = page.body.replace(/\n/g, ' ').slice(0, 200);
        }
        if (page.ogImage && oss) {
          const ossUrl = await mirrorImageToOSS(page.ogImage, id, oss);
          if (ossUrl) imageUrl = ossUrl;
        }
        if (page.body.length > 0 || imageUrl) enriched++;
      } catch { /* continue with RSS data */ }

      // 质量门控
      if (content.length < NewsFetcherService.MIN_CONTENT_LENGTH
        || content.length > NewsFetcherService.MAX_CONTENT_LENGTH) {
        skipped++;
        continue;
      }

      await ctx.model.News.create({
        id,
        title: article.title,
        summary,
        content,
        imageUrl,
        source: article.source,
        sourceUrl: article.sourceUrl,
        category: article.category,
        difficulty: '',
        status: 'draft',
        annotations: JSON.stringify({ imageEmoji: categoryEmoji(article.category), cache: {} }),
        publishedAt: article.publishedAt,
      });
      inserted++;
    }

    return { inserted, skipped, enriched };
  }
}
