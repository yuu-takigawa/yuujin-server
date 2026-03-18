/**
 * NewsFetcherService — 自动抓取日本新闻
 *
 * 来源:
 *   1. Yahoo! ニュース 主要（N4 — 学習者向け短文見出し）
 *   2. Yahoo! ニュース IT/テクノロジー（N3）
 *   3. 朝日新聞 RSS（N2）
 *
 * 注：NHK Web Easy は 2025 年以降認証必須になり ECS からアクセス不可のため
 *     Yahoo Japan に切り替え。
 *
 * 流程: 抓取 → XML 解析 → 去重（source_url）→ 存 DB → 触发 AI 注释
 */

import { v4 as uuidv4 } from 'uuid';

export interface RawArticle {
  title: string;
  summary: string;
  content: string;
  sourceUrl: string;
  source: string;
  imageUrl: string;
  publishedAt: Date;
  category: string;
  difficulty: string;
}

// ─── RSS/RDF XML パーサー（外部依存なし）──────────────────────────────────────

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

/**
 * RSS 2.0（<item>）と RDF 1.0（<item rdf:about="...">）両方に対応
 */
function parseRSSItems(xml: string): Array<{
  title: string; link: string; description: string;
  pubDate: string; enclosure: string; category: string;
}> {
  const items: ReturnType<typeof parseRSSItems> = [];
  // <item> or <item rdf:about="..."> both matched by [^>]*
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];
    const enclosureMatch = block.match(/<enclosure[^>]+url="([^"]+)"/i);
    // dc:date fallback for RDF feeds
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

// ─── 各ソース抓取ロジック ──────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Yuujin-NewsBot/1.0 (+https://yuujin.cc)' },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Yahoo! ニュース 主要トピック — N4 学習者向け */
async function fetchYahooMain(): Promise<RawArticle[]> {
  const url = 'https://news.yahoo.co.jp/rss/topics/top-picks.xml';
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const xml = await res.text();
    const items = parseRSSItems(xml);

    return items.slice(0, 10).map((item) => ({
      title: item.title,
      summary: item.description.replace(/<[^>]+>/g, '').slice(0, 200),
      content: item.description.replace(/<[^>]+>/g, '') || item.title,
      sourceUrl: item.link,
      source: 'Yahoo!ニュース',
      imageUrl: item.enclosure || '',
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      category: mapCategory(item.category || item.title),
      difficulty: 'N4',
    }));
  } catch {
    return [];
  }
}

/** Yahoo! ニュース IT — N3 */
async function fetchYahooIT(): Promise<RawArticle[]> {
  const url = 'https://news.yahoo.co.jp/rss/topics/it.xml';
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const xml = await res.text();
    const items = parseRSSItems(xml);

    return items.slice(0, 8).map((item) => ({
      title: item.title,
      summary: item.description.replace(/<[^>]+>/g, '').slice(0, 200),
      content: item.description.replace(/<[^>]+>/g, '') || item.title,
      sourceUrl: item.link,
      source: 'Yahoo!ニュース IT',
      imageUrl: item.enclosure || '',
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      category: 'technology',
      difficulty: 'N3',
    }));
  } catch {
    return [];
  }
}

/** 朝日新聞 RDF — N2 */
async function fetchAsahi(): Promise<RawArticle[]> {
  const url = 'https://www.asahi.com/rss/asahi/newsheadlines.rdf';
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const xml = await res.text();
    const items = parseRSSItems(xml);

    return items.slice(0, 8).map((item) => ({
      title: item.title,
      summary: item.description.replace(/<[^>]+>/g, '').slice(0, 200),
      // 朝日 RDF の description は空の場合が多いので title でフォールバック
      content: item.description.replace(/<[^>]+>/g, '') || item.title,
      sourceUrl: item.link,
      source: '朝日新聞',
      imageUrl: '',
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      category: mapCategory(item.title),
      difficulty: 'N2',
    }));
  } catch {
    return [];
  }
}

function mapCategory(text: string): string {
  if (/政治|選挙|国会|政府/.test(text)) return 'politics';
  if (/経済|株|企業|ビジネス/.test(text)) return 'business';
  if (/テクノロジー|AI|科学|技術|宇宙|IT/.test(text)) return 'technology';
  if (/スポーツ|野球|サッカー|オリンピック/i.test(text)) return 'sports';
  if (/文化|芸術|映画|音楽|アニメ/.test(text)) return 'culture';
  if (/旅行|観光|グルメ|食/.test(text)) return 'travel';
  if (/国際|世界|海外/.test(text)) return 'international';
  if (/社会|事件|事故/.test(text)) return 'society';
  if (/健康|医療|病気/.test(text)) return 'health';
  return 'general';
}

// ─── メインサービス ──────────────────────────────────────────────────────────

export class NewsFetcherService {
  /** 全ソースから抓取、去重し新規記事を返す */
  async fetchAll(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx: any,
  ): Promise<{ inserted: number; skipped: number }> {
    const results = await Promise.allSettled([
      fetchYahooMain(),
      fetchYahooIT(),
      fetchAsahi(),
    ]);

    const articles: RawArticle[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') articles.push(...r.value);
    }

    let inserted = 0;
    let skipped = 0;

    for (const article of articles) {
      if (!article.title || !article.sourceUrl) { skipped++; continue; }

      // 去重：source_url 唯一
      const existing = await ctx.model.News.findOne({ sourceUrl: article.sourceUrl });
      if (existing) { skipped++; continue; }

      await ctx.model.News.create({
        id: uuidv4(),
        title: article.title,
        summary: article.summary || '',
        content: article.content || article.title,
        imageUrl: article.imageUrl || '',
        source: article.source,
        sourceUrl: article.sourceUrl,
        category: article.category,
        difficulty: article.difficulty,
        annotations: JSON.stringify({ imageEmoji: categoryEmoji(article.category), paragraphs: [], comments: [] }),
        publishedAt: article.publishedAt,
      });
      inserted++;
    }

    return { inserted, skipped };
  }
}

function categoryEmoji(category: string): string {
  const map: Record<string, string> = {
    politics: '🏛️', business: '💼', technology: '💻', sports: '⚽',
    culture: '🎭', travel: '✈️', international: '🌍', society: '📰',
    health: '🏥', general: '📋',
  };
  return map[category] || '📰';
}
