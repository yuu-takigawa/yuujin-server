/**
 * seed-avatars.ts — 下载いらすとや头像并上传到 OSS
 *
 * 使用方式（在 ECS 或本地有 OSS 配置时）：
 *   npx ts-node scripts/seed-avatars.ts
 *
 * 环境变量（或从 .env 读取）：
 *   OSS_REGION, OSS_BUCKET, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET
 */

import * as crypto from 'crypto';
import * as path from 'path';

// ─── いらすとや 头像 URL 列表 ───
const AVATAR_SOURCES = [
  // 男の子
  { id: 'boy-01', label: '男の子A', url: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEirQIqMrqy-o_GnGz9vhmRG3q8xLFR3fdHN0gmV0ST5Y8k0twPi5BCHwZ9YdbtXORLR6PpJJSiT18wWT91Jd6bNnEyJ80wK1NqvXRBKMbIOrH99uTp6RmvjDx5y5yRmPIy32g_V00epUQw/s400/boy_01.png' },
  { id: 'boy-02', label: '男の子B', url: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhkNLKplEWXLF-cxFgelkQIB1w58r-XAQWF62LCpqi3B-uL8S9ovRJRYIsrebJzrht6wW5-so6yepedG7BLKFYumnclx-xY6oigifkxQc2g-6IZ9GT6pSpkdn8_2xDEhDCTaEaq1p6NEKA/s400/boy_02.png' },
  { id: 'boy-03', label: '男の子C', url: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgMM94OYOOG2By9F4ccgSwuyx5namcOKSmchfWyWlqwUYViOMjH6Hv3MDjmQI2lVyY5Mr0x6azQduI9wRBesHIoPnLqNUfDbPdJbdZR1fkpdpD6H3D1qIns59S6SQz5zGH9zMRZxLA6a0M/s400/boy_03.png' },
  { id: 'boy-04', label: '男の子D', url: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEg_bBc99ElTVwJ8__Xqwd5e9VMkhdeOkefEcHvednl0i3lLUPbe4X5m_I9_V02w4G7gZSJL1mFjdWifNF_MZKdICSPKhgjhWpAxwQXG3VJCahHSOuQK15id2Qs8QJ8TMcKb-tKbjRM7vCI/s400/boy_04.png' },
  { id: 'boy-05', label: '男の子E', url: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhgk-H5O8CAzlEmPYFTucQjLhXTlyLZrNS4duCwq1288x1liWg-lckZ-X_DgA-BvwTWlcdITak8RuNKh3yTxMNmtE3HJjmtjH-D0BCZOoSq9N5WE37og-9iYa2_GplaqRNmQCcL1duSc7Q/s400/boy_05.png' },
  { id: 'boy-06', label: '男の子F', url: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgs_-cqQspgAOwSbZfaSxi23JXwFosNbYyDxFPbvZF-lHST5sskXaGxOfGWMN1zZrmUa-Yx89DT7A-vsNQ731FtDsd_s-lnk6vme9s4SaV2nPq_DlXgsz9OeC47uOK-m27pf6tOu9bQPwg/s400/boy_08.png' },
  // 女の子
  { id: 'girl-01', label: '女の子A', url: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhBfolqi8tlqY4yVXJbvVGCJwT0c7ADx9Mv8VCS7kcQDHplaYitvwd3NSDD3lLLky5Et_mBTDiWGKEYvIW9y28CpDjIzwcd0f6O2ss0MZkY7PO8bX7VHiaFy2Zxv4O7QsWIVhwQILyWQYo/s400/youngwoman_37.png' },
  { id: 'girl-02', label: '女の子B', url: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiLZYnoToaAbYd9_fC_Uwkk7DDXFQ3N6dyRAibzxaWAoTkT-8cfufyieZpsBU94hbHUE2bbTsFHDANkI0R-_WgLKxH2g0cD5fSVpyM3B-q3ClYtC4HlFG3XXabnZ1UQQ7ZBfmQh6VTeOzA/s400/youngwoman_38.png' },
  { id: 'girl-03', label: '女の子C', url: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEi4OVH2l_91-VCNi2JnqpajmaYSR3_CcRDS3qVtLskvC647ss2lRg6dqjoFC7fYkwEzt-ny1GI03-y3mtd1t-mmJC0iyV4G60ZsUTXi4Dz_HXterR-fk-DYlX4qitZAmbBCvDOta8T_oiI/s400/youngwoman_39.png' },
  { id: 'girl-04', label: '女の子D', url: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEj9lQ7mExKfjpIo8ebmBE2WXKD7xRUYUJmQKjTPESgRwsIGNq6lcwMOqxvdCJU6SYZQeL3N34VB59VRXlD0zoWCEiBD5OlmcRTVEgZQpShPQ8F77XS8HdTqiTjwZFR8Qi6YUQ5nHByaHBk/s400/youngwoman_40.png' },
  { id: 'girl-05', label: '女の子E', url: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgmVYnaZD7MpBfHSoptE8sgQTAqYOuz-KNUOlQCUvzO9uo47AADDb1SK7s8GPYDE2_qBUJtR4IFMaO6ovo7_rLKZxfPNgWX7X4qj0aa2sAqLXEzffsoZnxF6Se_E05in5yP8Ufn7LbQC_o/s400/youngwoman_41.png' },
  { id: 'girl-06', label: '女の子F', url: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEivLUx1V1AdsHtS00EyFhXxhujhP9RbvGupWaBZyjXRyel3s7IWYdrmtzYdhP4H9qLGbtniC-gEcTFalgiuo7qyZ2hBRfnzC3gZwSDR2emsXu53oQEZtlbG_Gy4d_SUrhAFp98-jSTwQQg/s400/youngwoman_42.png' },
];

// ─── OSS 上传（复用 OSSService 逻辑） ───
function ossUpload(config: { region: string; bucket: string; accessKeyId: string; accessKeySecret: string }, key: string, data: Buffer, contentType: string) {
  const { region, bucket, accessKeyId, accessKeySecret } = config;
  const endpoint = `${bucket}.${region}.aliyuncs.com`;
  const url = `https://${endpoint}/${key}`;
  const date = new Date().toUTCString();
  const contentMd5 = crypto.createHash('md5').update(data).digest('base64');
  const stringToSign = ['PUT', contentMd5, contentType, date, `x-oss-object-acl:public-read\n/${bucket}/${key}`].join('\n');
  const signature = crypto.createHmac('sha1', accessKeySecret).update(stringToSign).digest('base64');

  return fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `OSS ${accessKeyId}:${signature}`,
      Date: date,
      'Content-Type': contentType,
      'Content-MD5': contentMd5,
      'x-oss-object-acl': 'public-read',
    },
    body: new Uint8Array(data),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`OSS upload failed: ${res.status} ${await res.text()}`);
    return `https://${endpoint}/${key}`;
  });
}

async function main() {
  // 读取 OSS 配置
  const region = process.env.OSS_REGION || 'oss-cn-hangzhou';
  const bucket = process.env.OSS_BUCKET || '';
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID || '';
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET || '';

  if (!bucket || !accessKeyId) {
    // 尝试从 .env 读取
    try {
      const fs = await import('fs');
      const envPath = path.join(__dirname, '..', '.env');
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const envVars: Record<string, string> = {};
      for (const line of envContent.split('\n')) {
        const [k, ...v] = line.split('=');
        if (k && v.length) envVars[k.trim()] = v.join('=').trim();
      }
      const cfg = {
        region: envVars.OSS_REGION || region,
        bucket: envVars.OSS_BUCKET || bucket,
        accessKeyId: envVars.OSS_ACCESS_KEY_ID || envVars.ALIBABA_CLOUD_ACCESS_KEY_ID || accessKeyId,
        accessKeySecret: envVars.OSS_ACCESS_KEY_SECRET || envVars.ALIBABA_CLOUD_ACCESS_KEY_SECRET || accessKeySecret,
      };
      if (!cfg.bucket || !cfg.accessKeyId) {
        console.error('OSS config not found. Set OSS_BUCKET, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET');
        process.exit(1);
      }
      return run(cfg);
    } catch {
      console.error('OSS config not found');
      process.exit(1);
    }
  }

  return run({ region, bucket, accessKeyId, accessKeySecret });
}

async function run(config: { region: string; bucket: string; accessKeyId: string; accessKeySecret: string }) {
  console.log(`Uploading ${AVATAR_SOURCES.length} avatars to OSS (${config.bucket})...\n`);

  const results: Array<{ id: string; label: string; url: string }> = [];

  for (const src of AVATAR_SOURCES) {
    try {
      // 下载
      const res = await fetch(src.url);
      if (!res.ok) { console.log(`  SKIP ${src.id}: download failed (${res.status})`); continue; }
      const buffer = Buffer.from(await res.arrayBuffer());

      // 上传到 OSS
      const key = `avatars/presets/${src.id}.png`;
      const ossUrl = await ossUpload(config, key, buffer, 'image/png');
      results.push({ id: src.id, label: src.label, url: ossUrl });
      console.log(`  OK   ${src.id} → ${ossUrl}`);
    } catch (err) {
      console.log(`  FAIL ${src.id}: ${(err as Error).message}`);
    }
  }

  console.log(`\nDone! ${results.length}/${AVATAR_SOURCES.length} uploaded.\n`);
  console.log('// 将以下内容粘贴到 AvatarController.ts 的 PRESET_AVATARS:');
  console.log('const PRESET_AVATARS = [');
  for (const r of results) {
    console.log(`  { id: '${r.id}', label: '${r.label}', url: '${r.url}' },`);
  }
  console.log('];');
}

main().catch(console.error);
