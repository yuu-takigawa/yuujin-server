import { systemRules } from '../../../../prompts/system-rules';

/**
 * Build the final system prompt for a conversation.
 *
 * Composition order:
 *   Layer 1: systemRules        — global behavioral rules (all characters)
 *   Layer 2: friendship.soul    — character identity + per-user relationship state
 *   Layer 3: friendship.memory  — factual memories about this user
 *   Layer 4: jpLevel            — Japanese difficulty adaptation
 *
 * Note: Topic cards and news references are submitted as user messages,
 * NOT injected here.
 */
export function buildSystemPrompt(options: {
  /** Per-friendship soul (starts as character.initialSoul, evolves via GrowthEngine) */
  soul?: string | null;
  /** Per-friendship memory (starts null, built up over time) */
  memory?: string | null;
  userLevel?: string;
}): string {
  const parts: string[] = [];

  // Layer 1: global system rules
  parts.push(systemRules);

  // Layer 2: character identity + per-user relationship (soul)
  if (options.soul) {
    parts.push(options.soul);
  }

  // Layer 3: memories about this user
  if (options.memory) {
    parts.push(`## この会話相手についての記憶\n${options.memory}`);
  }

  // Layer 4: Japanese difficulty adaptation
  if (options.userLevel) {
    const levelDescriptions: Record<string, string> = {
      none: '完全な初心者（日本語を学んだことがない）。ひらがなから始めて、非常にシンプルな日本語を使ってください。中国語での補足を多めに。',
      N5: '初級（JLPT N5レベル）。基本的な挨拶と簡単な文が分かります。短い文で話してください。',
      N4: '初中級（JLPT N4レベル）。日常会話の基本ができます。少し複雑な文も使えます。',
      N3: '中級（JLPT N3レベル）。日常的な日本語はだいたい理解できます。自然な会話ができます。',
      N2: '中上級（JLPT N2レベル）。新聞やニュースも理解できます。より自然で複雑な表現を使ってください。',
      N1: '上級（JLPT N1レベル）。ほぼネイティブレベル。自然な日本語で普通に会話してください。',
      native: '母語話者レベル。敬語・タメ口・方言・スラングを含め、完全に自然な日本語で話してください。学習者への配慮は不要です。',
    };
    const desc = levelDescriptions[options.userLevel] || levelDescriptions['N5'];
    parts.push(`## 学習者のレベル\n${desc}`);
  }

  return parts.join('\n\n');
}
