import { systemRules, LEVEL_DESCRIPTIONS } from 'yuujin-prompts';

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
    const desc = LEVEL_DESCRIPTIONS[options.userLevel] || LEVEL_DESCRIPTIONS['N5'];
    parts.push(`## 学習者のレベル\n${desc}`);
  }

  return parts.join('\n\n');
}
