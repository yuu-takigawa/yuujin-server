/**
 * NewsFetcherService — 自动抓取日本新闻
 *
 * 来源:
 *   1. NHK Web Easy（やさしい日本語）- 最适合日语学习
 *   2. NHK News RSS
 *   3. 朝日新聞 RSS
 *
 * 流程: 抓取 → XML/JSON 解析 → 去重（source_url）→ 存 DB → 触发 AI 注释
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

// ─── RSS XML 简单解析器（无外部依赖）─────────────────────────────────────────

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

function parseRSSItems(xml: string): Array<{
  title: string; link: string; description: string;
  pubDate: string; enclosure: string; category: string;
}> {
  const items: ReturnType<typeof parseRSSItems> = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];
    const enclosureMatch = block.match(/<enclosure[^>]+url="([^"]+)"/i);
    items.push({
      title: extractTag(block, 'title'),
      link: extractTag(block, 'link'),
      description: extractTag(block, 'description'),
      pubDate: extractTag(block, 'pubDate'),
      enclosure: enclosureMatch?.[1] || '',
      category: extractTag(block, 'category'),
    });
  }
  return items;
}

// ─── 各来源抓取逻辑 ────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
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

/** NHK Web Easy — N4~N5 级别，最适合学习 */
async function fetchNHKWebEasy(): Promise<RawArticle[]> {
  const url = 'https://www3.nhk.or.jp/news/easy/k10_news_easy_all.xml';
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const xml = await res.text();
    const items = parseRSSItems(xml);

    return items.slice(0, 10).map((item) => ({
      title: item.title,
      summary: item.description.replace(/<[^>]+>/g, '').slice(0, 200),
      content: item.description.replace(/<[^>]+>/g, ''),
      sourceUrl: item.link,
      source: 'NHK Web Easy',
      imageUrl: item.enclosure || '',
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      category: mapCategory(item.category || item.title),
      difficulty: 'N4',
    }));
  } catch {
    return [];
  }
}

/** NHK News（标准日语）— N3~N2 级别 */
async function fetchNHKNews(): Promise<RawArticle[]> {
  // NHK provides JSON feeds per category
  const feeds = [
    { url: 'https://www3.nhk.or.jp/news/json16/category/all.json', label: 'NHK News' },
  ];

  const articles: RawArticle[] = [];
  for (const feed of feeds) {
    try {
      const res = await fetchWithTimeout(feed.url);
      if (!res.ok) continue;
      const text = await res.text();
      // NHK News JSON format: { channel: { item: [...] } }
      const json = JSON.parse(text.replace(/^[^{]*{/, '{').replace(/}[^}]*$/, '}'));
      const items = json?.channel?.item || [];
      for (const item of items.slice(0, 8)) {
        articles.push({
          title: item.title || '',
          summary: (item.description || '').replace(/<[^>]+>/g, '').slice(0, 200),
          content: (item.description || '').replace(/<[^>]+>/g, ''),
          sourceUrl: item.link || '',
          source: feed.label,
          imageUrl: item['media:thumbnail']?.['@url'] || '',
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          category: mapCategory(item.title || ''),
          difficulty: 'N3',
        });
      }
    } catch { /* ignore per-feed errors */ }
  }
  return articles;
}

/** 朝日新聞 RSS — N2~N1 级别 */
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
      content: item.description.replace(/<[^>]+>/g, ''),
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
  const t = text.toLowerCase();
  if (/政治|選挙|国会|政府/.test(text)) return 'politics';
  if (/経済|株|企業|ビジネス/.test(text)) return 'business';
  if (/テクノロジー|AI|科学|技術|宇宙/.test(text)) return 'technology';
  if (/スポーツ|野球|サッカー|オリンピック/.test(t)) return 'sports';
  if (/文化|芸術|映画|音楽|アニメ/.test(text)) return 'culture';
  if (/旅行|観光|グルメ|食/.test(text)) return 'travel';
  if (/国際|世界|海外/.test(text)) return 'international';
  if (/社会|事件|事故/.test(text)) return 'society';
  if (/健康|医療|病気/.test(text)) return 'health';
  return 'general';
}

// ─── 主服务 ─────────────────────────────────────────────────────────────────

export class NewsFetcherService {
  /** 从所有来源抓取，去重并返回新文章 */
  async fetchAll(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx: any,
  ): Promise<{ inserted: number; skipped: number }> {
    const results = await Promise.allSettled([
      fetchNHKWebEasy(),
      fetchNHKNews(),
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
        summary: article.summary,
        content: article.content,
        imageUrl: article.imageUrl,
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
