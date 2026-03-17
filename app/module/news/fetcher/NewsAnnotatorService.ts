/**
 * NewsAnnotatorService — AI 给新闻添加注释
 *
 * 对 annotations.paragraphs 为空的文章，调用 ProductAI 生成：
 *   - 段落分句
 *   - 每句的 ruby（假名）注音
 *   - 中文翻译
 *   - 语法说明
 *
 * 按用户的 JLPT 等级生成对应难度的注释。
 * 如果 content 为空，先从 sourceUrl 抓取正文。
 */

import { productAIChat, ProductAIConfig } from '../../ai/ProductAIService';

export interface AnnotatedParagraph {
  id: string;
  text: string;
  ruby: [string, string][];  // [[kanji, reading], ...]
  translation: string;
  explanation: string;
}

export interface NewsAnnotations {
  imageEmoji: string;
  paragraphs: AnnotatedParagraph[];
  comments: unknown[];
}

export class NewsAnnotatorService {
  private aiConfig: ProductAIConfig;

  constructor(aiConfig: ProductAIConfig) {
    this.aiConfig = aiConfig;
  }

  /** 为一篇文章生成注释，返回 annotations JSON */
  async annotate(
    title: string,
    content: string,
    difficulty: string,
    existingAnnotations: NewsAnnotations,
  ): Promise<NewsAnnotations> {
    if (existingAnnotations.paragraphs.length > 0) {
      return existingAnnotations; // 已注释过，跳过
    }

    const text = content || title;
    // 截取前 500 字（节约 token）
    const excerpt = text.slice(0, 500);

    const levelNote: Record<string, string> = {
      none: 'N5初心者向け（ひらがな多用、超簡単な説明）',
      N5: 'N5レベル（基本語彙のみ、短い説明）',
      N4: 'N4レベル（日常語彙、簡単な文法説明）',
      N3: 'N3レベル（自然な表現、少し詳しい説明）',
      N2: 'N2レベル（複雑な表現OK、簡潔な説明）',
      N1: 'N1・ネイティブ向け（高度な語彙、詳細な説明不要）',
      native: 'ネイティブ向け（説明不要、訳も不要）',
    };
    const note = levelNote[difficulty] || levelNote['N4'];

    const systemPrompt = `あなたは日本語学習者向けのニュース注釈AIです。${note}`;

    const userPrompt = `
以下のニュース本文を分析して、日本語学習者向けの注釈を作成してください。

タイトル: ${title}
本文（抜粋）: ${excerpt}

以下のJSON形式で返してください（段落は最大4つ）:
{
  "paragraphs": [
    {
      "id": "p1",
      "text": "文の一部または1文",
      "ruby": [["漢字", "よみかた"], ...],
      "translation": "中文翻译",
      "explanation": "この文のポイントとなる文法・語彙の説明（50字以内）"
    }
  ]
}

注意:
- text は元のニュース本文から取る（改変しない）
- ruby は難しい漢字のみ（簡単な字は省略可）
- explanation は ${difficulty} レベルに合わせる
- JSONのみ返す`.trim();

    try {
      const response = await productAIChat(
        this.aiConfig,
        [{ role: 'user', content: userPrompt }],
        systemPrompt,
      );

      const match = response.match(/\{[\s\S]*\}/);
      if (!match) return existingAnnotations;

      const parsed = JSON.parse(match[0]) as { paragraphs?: AnnotatedParagraph[] };
      if (!parsed.paragraphs?.length) return existingAnnotations;

      return {
        ...existingAnnotations,
        paragraphs: parsed.paragraphs,
      };
    } catch {
      return existingAnnotations;
    }
  }
}
