/**
 * 从本地文件上传预设头像到 OSS
 * npx tsx scripts/upload-avatars-local.ts
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const AVATAR_DIR = process.platform === 'win32'
  ? 'C:\\Users\\17816\\AppData\\Local\\Temp\\yuujin-avatars'
  : '/tmp/yuujin-avatars';
const AVATARS = [
  { id: 'boy-01', label: '男の子A' },
  { id: 'boy-02', label: '男の子B' },
  { id: 'boy-03', label: '男の子C' },
  { id: 'boy-04', label: '男の子D' },
  { id: 'boy-05', label: '男の子E' },
  { id: 'boy-06', label: '男の子F' },
  { id: 'girl-01', label: '女の子A' },
  { id: 'girl-02', label: '女の子B' },
  { id: 'girl-03', label: '女の子C' },
  { id: 'girl-04', label: '女の子D' },
  { id: 'girl-05', label: '女の子E' },
  { id: 'girl-06', label: '女の子F' },
];

function readEnv(): Record<string, string> {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return {};
  const vars: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) vars[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return vars;
}

async function ossUpload(config: { region: string; bucket: string; accessKeyId: string; accessKeySecret: string }, key: string, data: Buffer, contentType: string): Promise<string> {
  const { region, bucket, accessKeyId, accessKeySecret } = config;
  const endpoint = `${bucket}.${region}.aliyuncs.com`;
  const url = `https://${endpoint}/${key}`;
  const date = new Date().toUTCString();
  const contentMd5 = crypto.createHash('md5').update(data).digest('base64');
  const stringToSign = ['PUT', contentMd5, contentType, date, `x-oss-object-acl:public-read\n/${bucket}/${key}`].join('\n');
  const signature = crypto.createHmac('sha1', accessKeySecret).update(stringToSign).digest('base64');

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `OSS ${accessKeyId}:${signature}`,
      Date: date,
      'Content-Type': contentType,
      'Content-MD5': contentMd5,
      'x-oss-object-acl': 'public-read',
    },
    body: new Uint8Array(data),
  });
  if (!res.ok) throw new Error(`OSS ${res.status}: ${await res.text()}`);
  return `https://${endpoint}/${key}`;
}

async function main() {
  const env = readEnv();
  const config = {
    region: env.OSS_REGION || 'oss-cn-hangzhou',
    bucket: env.OSS_BUCKET || '',
    accessKeyId: env.OSS_ACCESS_KEY_ID || '',
    accessKeySecret: env.OSS_ACCESS_KEY_SECRET || '',
  };
  if (!config.bucket || !config.accessKeyId) {
    console.error('Missing OSS config in .env');
    process.exit(1);
  }

  console.log(`Uploading ${AVATARS.length} avatars from ${AVATAR_DIR} to ${config.bucket}...\n`);

  const results: string[] = [];
  for (const av of AVATARS) {
    const filePath = path.join(AVATAR_DIR, `${av.id}.png`);
    if (!fs.existsSync(filePath)) { console.log(`  SKIP ${av.id}: file not found`); continue; }
    const data = fs.readFileSync(filePath);
    try {
      const url = await ossUpload(config, `avatars/presets/${av.id}.png`, data, 'image/png');
      console.log(`  OK   ${av.id} → ${url}`);
      results.push(`  { id: '${av.id}', label: '${av.label}', url: '${url}' },`);
    } catch (err) {
      console.log(`  FAIL ${av.id}: ${(err as Error).message}`);
    }
  }

  console.log(`\n// PRESET_AVATARS for AvatarController.ts:`);
  console.log(`const PRESET_AVATARS = [`);
  results.forEach(l => console.log(l));
  console.log(`];`);
}

main();
