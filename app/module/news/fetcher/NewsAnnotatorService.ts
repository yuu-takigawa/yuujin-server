/**
 * NewsAnnotatorService — AI 给新闻添加注释
 *
 * 按段落生成注释：
 *   - 将正文按段落组织（每段可含多句）
 *   - 每段提供 ruby（假名注音）、中文翻译、语法说明
 *   - 按用户 JLPT 等级生成对应难度的注释
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
    if (existingAnnotations.paragraphs?.length > 0) {
      return existingAnnotations;
    }

    const text = content || title;
    // 截取前 4000 字（给 AI 足够上下文，避免长文被截断）
    const excerpt = text.slice(0, 4000);

    const levelNote: Record<string, string> = {
      none: '面向N5初学者（多用平假名，用最简单的中文解释）',
      N5: '面向N5水平学习者（仅基础词汇，简短的中文说明）',
      N4: '面向N4水平学习者（日常词汇，简单的语法说明）',
      N3: '面向N3水平学习者（较自然的表达，稍详细的说明）',
      N2: '面向N2水平学习者（可包含复杂表达，简明的说明）',
      N1: '面向N1及母语水平学习者（高级词汇，简要说明即可）',
      native: '面向母语水平读者（无需详细解释）',
    };
    const note = levelNote[difficulty] || levelNote['N4'];

    const systemPrompt = `你是一个面向中国日语学习者的新闻注释AI。${note}。请全程使用中文撰写explanation字段。`;

    const userPrompt = `
请将以下日语新闻正文按段落逐段分析，为中国日语学习者生成注释。

标题: ${title}
正文: ${excerpt}

请严格按以下JSON格式返回:
{
  "paragraphs": [
    {
      "id": "p1",
      "text": "段落原文（可包含多句，直接从原文复制，不要改动）",
      "ruby": [["漢字", "よみかた"], ...],
      "translation": "该段落的完整中文翻译",
      "explanation": "用中文撰写，200字以内，详细说明该段中重要语法结构、关键词汇的含义和用法"
    }
  ]
}

重要规则:
- 按段落整理（每段约2~4句）
- text 必须从原文直接复制，不得改动
- 必须覆盖全文，不得省略
- ruby 仅标注段落内较难的汉字读音
- translation 是该段落的完整中文翻译
- explanation 用中文撰写，200字以内，针对${difficulty}水平详细解说语法结构和关键词汇
- 仅返回JSON，不要附加其他内容`.trim();

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
