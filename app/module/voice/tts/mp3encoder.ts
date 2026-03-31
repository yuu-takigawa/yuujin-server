/**
 * lamejs Node.js 适配器
 *
 * lamejs 是浏览器端库，lame.all.js 用自调用函数导出。
 * 在 Node.js 中需要 patch 导出方式才能使用。
 */

import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _lamejs: any = null;

function getLamejs() {
  if (_lamejs) return _lamejs;

  const code = fs.readFileSync(
    path.join(__dirname, '../../../../node_modules/lamejs/lame.all.js'),
    'utf8',
  );

  const patched = code
    .replace('lamejs.Mp3Encoder = Mp3Encoder;', 'module.exports.Mp3Encoder = Mp3Encoder;')
    .replace('lamejs.WavHeader = WavHeader;', 'module.exports.WavHeader = WavHeader;');

  const m = { exports: {} as Record<string, unknown> };
  const fn = new Function('module', 'exports', patched);
  fn(m, m.exports);

  _lamejs = m.exports;
  return _lamejs;
}

export function createMp3Encoder(channels: number, sampleRate: number, bitRate: number) {
  const lamejs = getLamejs();
  return new lamejs.Mp3Encoder(channels, sampleRate, bitRate);
}
