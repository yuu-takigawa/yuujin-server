/**
 * furigana-worker — 子进程振り仮名生成器
 *
 * 由 news-fetcher 通过 child_process.execFile 调用。
 * stdin: JSON { paragraphs: string[] }
 * stdout: JSON { furigana: { [index: string]: [string, string][] } }
 *
 * 子进程执行完即退出，kuromoji 词典内存随之释放。
 */

import * as kuromoji from 'kuromoji';
import * as path from 'path';

function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30FA]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

function containsKanji(str: string): boolean {
  return /[\u4E00-\u9FFF\u3400-\u4DBF]/.test(str);
}

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString()) as { paragraphs: string[] };

  const tokenizer = await new Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>>((resolve, reject) => {
    const dicPath = path.join(process.cwd(), 'node_modules', 'kuromoji', 'dict');
    kuromoji.builder({ dicPath }).build((err, t) => {
      if (err) reject(err);
      else resolve(t);
    });
  });

  const furigana: Record<string, [string, string][]> = {};
  for (let i = 0; i < input.paragraphs.length; i++) {
    const tokens = tokenizer.tokenize(input.paragraphs[i]);
    const ruby: [string, string][] = [];
    for (const token of tokens) {
      if (containsKanji(token.surface_form) && token.reading) {
        const reading = katakanaToHiragana(token.reading);
        if (reading !== token.surface_form) {
          ruby.push([token.surface_form, reading]);
        }
      }
    }
    if (ruby.length > 0) {
      furigana[String(i)] = ruby;
    }
  }

  process.stdout.write(JSON.stringify({ furigana }));
}

main().catch((err) => {
  process.stderr.write(String(err));
  process.exit(1);
});
