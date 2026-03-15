/**
 * Simple language detection utility
 * Detects whether text is primarily Japanese, Chinese, or other
 */

const HIRAGANA_RANGE = /[\u3040-\u309F]/;
const KATAKANA_RANGE = /[\u30A0-\u30FF]/;
const CJK_RANGE = /[\u4E00-\u9FFF]/;

export function detectLanguage(text: string): 'ja' | 'zh' | 'en' | 'unknown' {
  const hasHiragana = HIRAGANA_RANGE.test(text);
  const hasKatakana = KATAKANA_RANGE.test(text);
  const hasCJK = CJK_RANGE.test(text);

  if (hasHiragana || hasKatakana) {
    return 'ja';
  }
  if (hasCJK) {
    return 'zh';
  }
  if (/[a-zA-Z]/.test(text)) {
    return 'en';
  }
  return 'unknown';
}
