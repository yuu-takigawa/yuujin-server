/**
 * FuriganaService — kuromoji 辞書ベースの振り仮名生成
 *
 * AI 不要、token 消費ゼロ。形態素解析で漢字に読み仮名を付与。
 * シングルトンで辞書を一度だけロード。
 */

import * as kuromoji from 'kuromoji';
import * as path from 'path';

export interface FuriganaToken {
  /** 表層形（漢字含む元テキスト） */
  surface: string;
  /** 読み（カタカナ → ひらがな変換済み） */
  reading: string;
  /** 漢字を含むか（振り仮名が必要か） */
  hasKanji: boolean;
}

// カタカナ → ひらがな変換
function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30FA]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

// 漢字判定（CJK Unified Ideographs）
function containsKanji(str: string): boolean {
  return /[\u4E00-\u9FFF\u3400-\u4DBF]/.test(str);
}

let tokenizerPromise: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | null = null;

function getTokenizer(): Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      const dicPath = path.join(
        process.cwd(),
        'node_modules',
        'kuromoji',
        'dict',
      );
      kuromoji.builder({ dicPath }).build((err, tokenizer) => {
        if (err) {
          tokenizerPromise = null;
          reject(err);
        } else {
          resolve(tokenizer);
        }
      });
    });
  }
  return tokenizerPromise;
}

/**
 * テキストに振り仮名データを付与
 * 返り値: [[漢字, ひらがな], ...] ペア配列（漢字を含むトークンのみ）
 */
export async function generateFurigana(text: string): Promise<[string, string][]> {
  const tokenizer = await getTokenizer();
  const tokens = tokenizer.tokenize(text);
  const result: [string, string][] = [];

  for (const token of tokens) {
    if (containsKanji(token.surface_form) && token.reading) {
      const reading = katakanaToHiragana(token.reading);
      // 読みが表層形と同じ場合はスキップ（ひらがなのみの場合等）
      if (reading !== token.surface_form) {
        result.push([token.surface_form, reading]);
      }
    }
  }

  return result;
}
