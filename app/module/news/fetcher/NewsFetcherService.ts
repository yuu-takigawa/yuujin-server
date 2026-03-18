/**
 * NewsFetcherService — 自动抓取日本新闻
 *
 * 来源:
 *   1. Yahoo! ニュース 主要（N4 — 学習者向け短文見出し）
 *   2. Yahoo! ニュース IT/テクノロジー（N3）
 *   3. NHK ニュース RSS（N2 — 标准新闻）
 *   4. 朝日新聞 RDF（N1 — 高级新闻）
 *
 * 流程:
 *   抓取 RSS → 去重 → 存 DB → 抓源 URL 全文+OG 图 → 图片转存 OSS → 更新 DB
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

function parseRSSItems(xml: string): Array<{
  title: string; link: string; description: string;
  pubDate: string; enclosure: string; category: string;
}> {
  const items: ReturnType<typeof parseRSSItems> = [];
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

// ─── HTTP ヘルパー ──────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Yuujin-NewsBot/1.0)' },
      redirect: 'follow',
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── 源ページ解析（全文 + OG画像を1回の fetch で取得）─────────────────────────

interface PageData {
  body: string;     // 正文（<p> 标签提取）
  ogImage: string;  // og:image URL
}

/** 非正文パターン — ナビ、広告、シェアボタン等 */
const GARBAGE_PATTERNS = [
  /console\.log/,
  /googletag/,
  /JavaScript.*無効/,
  /JavaScriptの設定を/,
  /マイページ購入履歴/,
  /メールでシェアする/,
  /Facebookでシェアする/,
  /Xでシェアする/,
  /はてなブックマーク/,
  /シェアする.*シェアする/,
  /ランキング有料主要国内/,
  /トップ速報ライブ/,
  /購入履歴トップ/,
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
];

function isGarbageText(text: string): boolean {
  return GARBAGE_PATTERNS.some(re => re.test(text));
}

/**
 * 从源 URL 抓取网页，一次性提取正文和 OG 图片。
 * 优先从 <article> 标签提取正文，过滤掉导航/广告/脚本等。
 */
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
    // 1) 去掉 script / style / nav / footer / header / aside / noscript
    let cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // 2) 优先从 <article> 标签内提取（大多数新闻站点都用 <article>）
    const articleMatch = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const contentHtml = articleMatch ? articleMatch[1] : cleaned;

    // 3) 提取 <p> 标签，过滤垃圾文本
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
    const body = paragraphs.join('\n');

    return { body, ogImage };
  } catch {
    return { body: '', ogImage: '' };
  }
}

// ─── 各ソース抓取ロジック ──────────────────────────────────────────────────────

async function fetchYahooMain(): Promise<RawArticle[]> {
  const url = 'https://news.yahoo.co.jp/rss/topics/top-picks.xml';
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSSItems(xml).slice(0, 10).map((item) => ({
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
  } catch { return []; }
}

async function fetchYahooIT(): Promise<RawArticle[]> {
  const url = 'https://news.yahoo.co.jp/rss/topics/it.xml';
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSSItems(xml).slice(0, 8).map((item) => ({
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
  } catch { return []; }
}

async function fetchNHK(): Promise<RawArticle[]> {
  const url = 'https://news.web.nhk/n-data/conf/na/rss/cat0.xml';
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSSItems(xml).slice(0, 10).map((item) => ({
      title: item.title,
      summary: item.description.replace(/<[^>]+>/g, '').slice(0, 200),
      content: item.description.replace(/<[^>]+>/g, '') || item.title,
      sourceUrl: item.link,
      source: 'NHKニュース',
      imageUrl: '',
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      category: mapCategory(item.category || item.title),
      difficulty: 'N2',
    }));
  } catch { return []; }
}

async function fetchAsahi(): Promise<RawArticle[]> {
  const url = 'https://www.asahi.com/rss/asahi/newsheadlines.rdf';
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSSItems(xml).slice(0, 8).map((item) => ({
      title: item.title,
      summary: item.description.replace(/<[^>]+>/g, '').slice(0, 200),
      content: item.description.replace(/<[^>]+>/g, '') || item.title,
      sourceUrl: item.link,
      source: '朝日新聞',
      imageUrl: '',
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      category: mapCategory(item.title),
      difficulty: 'N1',
    }));
  } catch { return []; }
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

// ─── 画像 → OSS 転送 ────────────────────────────────────────────────────────

/**
 * 下载外部图片，上传到 OSS，返回 OSS URL。
 * 失败时返回空字符串。
 */
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
    if (buf.length < 1000 || buf.length > 5_000_000) return ''; // 跳过过小/过大

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

// ─── メインサービス ──────────────────────────────────────────────────────────

export class NewsFetcherService {
  /**
   * 全ソースから抓取、去重、新規記事は即座に全文+画像を取得して保存。
   * RSS のリンクは時間が経つと 404 になるため、挿入時に即座にスクレイピング。
   */
  /** 内容字数范围：过短无法阅读，过长体验差 */
  static MIN_CONTENT_LENGTH = 100;
  static MAX_CONTENT_LENGTH = 2000;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async fetchAll(ctx: any, ossConfig?: OSSConfig): Promise<{ inserted: number; skipped: number; enriched: number }> {
    const results = await Promise.allSettled([
      fetchYahooMain(),
      fetchYahooIT(),
      fetchNHK(),
      fetchAsahi(),
    ]);

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
      const existing = await ctx.model.News.findOne({ sourceUrl: article.sourceUrl });
      if (existing) { skipped++; continue; }

      const id = uuidv4();

      // 即座にソースページから全文＋OG画像を取得（RSS リンクは短命なので）
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

      // 质量门控：内容过短或过长的文章直接丢弃
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
        difficulty: article.difficulty,
        status: 'draft',
        annotations: JSON.stringify({ imageEmoji: categoryEmoji(article.category), paragraphs: [], comments: [] }),
        publishedAt: article.publishedAt,
      });
      inserted++;
    }

    return { inserted, skipped, enriched };
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
