import { defaultPrompt } from '../../../../prompts/default.example';
import { buildCustomCharacterPrompt } from '../../../../prompts/characters/_custom_template';

// Lazy-load character prompts to avoid import issues
const characterPrompts: Record<string, string> = {};

function loadCharacterPrompt(promptKey: string): string | null {
  if (characterPrompts[promptKey]) return characterPrompts[promptKey];

  try {
    // Dynamic require for character prompt files
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(`../../../../prompts/characters/${promptKey}`);
    characterPrompts[promptKey] = mod.prompt;
    return mod.prompt;
  } catch {
    return null;
  }
}

export function loadDefaultPrompt(): string {
  return defaultPrompt;
}

/**
 * Build a system prompt based on character and user context
 */
export function buildSystemPrompt(options: {
  character?: {
    name: string;
    promptKey?: string;
    age?: number;
    gender?: string;
    occupation?: string;
    personality?: string[];
    hobbies?: string[];
    location?: string;
    bio?: string;
  };
  userLevel?: string;
  newsRef?: string;
  topicRef?: string;
}): string {
  let prompt: string;

  // 1. Try character-specific prompt by promptKey
  if (options.character?.promptKey) {
    const loaded = loadCharacterPrompt(options.character.promptKey);
    if (loaded) {
      prompt = loaded;
    } else {
      // promptKey exists but no file found — use custom template
      prompt = buildCustomCharacterPrompt(options.character);
    }
  } else if (options.character) {
    // No promptKey — use custom template with character data
    prompt = buildCustomCharacterPrompt(options.character);
  } else {
    // No character info — use default prompt
    prompt = defaultPrompt;
  }

  // 2. Append user level context
  if (options.userLevel) {
    const levelDescriptions: Record<string, string> = {
      none: '完全な初心者（日本語を学んだことがない）。ひらがなから始めて、非常にシンプルな日本語を使ってください。中国語での補足を多めに。',
      N5: '初級（JLPT N5レベル）。基本的な挨拶と簡単な文が分かります。短い文で話してください。',
      N4: '初中級（JLPT N4レベル）。日常会話の基本ができます。少し複雑な文も使えます。',
      N3: '中級（JLPT N3レベル）。日常的な日本語はだいたい理解できます。自然な会話ができます。',
      N2: '中上級（JLPT N2レベル）。新聞やニュースも理解できます。より自然で複雑な表現を使ってください。',
      N1: '上級（JLPT N1レベル）。ほぼネイティブレベル。自然な日本語で普通に会話してください。',
    };
    const desc = levelDescriptions[options.userLevel] || levelDescriptions['N5'];
    prompt += `\n\n## 学習者のレベル\n${desc}`;
  }

  // 3. Append context references
  if (options.topicRef) {
    prompt += `\n\n## 話題\nユーザーが以下の話題について話したいと思っています: 「${options.topicRef}」\nこの話題から自然に会話を始めてください。`;
  }

  if (options.newsRef) {
    prompt += `\n\n## ニュース引用\nユーザーが以下のニュースについて話したいと思っています: 「${options.newsRef}」\nこのニュースの内容について会話してください。`;
  }

  return prompt;
}
