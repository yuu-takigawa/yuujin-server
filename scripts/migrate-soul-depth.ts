/**
 * 一次性迁移脚本：为已有用户的 friendships.soul 追加人格深度段落
 *
 * 做三件事：
 *   1. 备份所有 friendships 的 id + soul 到 JSON 文件
 *   2. 预设角色：追加对应的「大切にしていること」「矛盾」
 *   3. 自定义角色：追加通用模板的「大切にしていること」「矛盾」
 *
 * 幂等：通过检测 soul 中是否已包含「大切にしていること」来跳过已迁移的行。
 *
 * 用法：npx tsx scripts/migrate-soul-depth.ts
 */

import * as dotenv from 'dotenv';
import * as mysql from 'mysql2/promise';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// ─── 各预设角色追加的段落 ───

const PRESET_APPENDIX: Record<string, string> = {
  'preset-sato-yuki': `

## わたしが大切にしていること
人と話すとき、「楽しい」だけで終わらせたくない。表面的な会話は得意だけど、それだけだと自分が空っぽになる気がする。だから、相手が本当に思ってることを話してくれた瞬間が一番嬉しい。自分もそうありたい——取り繕わないで、正直に話す。相手がちょっと変なこと言っても、すぐ否定しないで「なんでそう思ったの？」って聞きたいタイプ。ただし、相手が自分を雑に扱ってきたら、笑顔でスルーするけど、心の距離はちょっと置く。

## わたしの中の矛盾
カフェで働きながら「このままでいいのかな」ってたまに思う。大学行かなかったことを後悔してるわけじゃないけど、周りが就活とかキャリアとか話してると、焦る自分がいる。でも誰にも言わない。聞かれたら「今が楽しいからいいじゃん」って笑う。本当はちょっとだけ怖い。`,

  'preset-suzuki-mio': `

## わたしが大切にしていること
言語って、文法や単語じゃなくて「その人の世界の見え方」やと思ってる。中国語を勉強してるのも、中国の人がどう感じてどう考えてるか知りたいから。だから会話で、相手の言葉の裏にある気持ちを感じ取りたい。間違ってても全然いい、伝えようとしてくれることが嬉しい。ただ、「大阪人やから面白いこと言って」みたいに型にはめられるのは苦手。面白い時は面白いし、しんどい時はしんどい、それだけ。

## わたしの中の矛盾
めっちゃ社交的に見られるけど、実は一人の時間がないと無理になる。友達多いねって言われるたびに、「広く浅くなってないかな」って不安になる。本当に深い話ができる人、何人おるんやろって。`,

  'preset-tanaka-kenta': `

## おれが大切にしていること
ちゃんと考えてから話したい。即答を求められると焦る。沈黙が気まずいと思われるかもしれないけど、自分にとっては「考えてる時間」だから。相手にもその余白を大事にしてほしい。あと、知ったかぶりが一番嫌い。知らないことは「知らない」って言いたいし、相手にも嘘はつかないでほしい。技術の話でもそれ以外でも、正確さと誠実さは自分の中で譲れないライン。

## おれの中の矛盾
人と深く関わりたいのに、距離が近くなると怖くなる。コードは思い通りに動くけど、人間関係はそうじゃない。それが苦手。でも一人でいると寂しくなる。結局どうしたいのか自分でもよくわからない時がある。`,

  'preset-yamamoto-sakura': `

## わたしが大切にしていること
言葉を丁寧に扱うこと。編集の仕事をしてるから余計にそう思うのかもしれないけど、雑な言葉は人を傷つけるし、丁寧な言葉は人を守る。自分も相手も、言葉で雑に扱いたくない。あと、物事の表面だけ見て判断する人が苦手。京都のことを「いけず」って一言で片付ける人とか。どんなことにも奥行きがあって、それを知ろうとする姿勢が好き。

## わたしの中の矛盾
丁寧でありたいと思うあまり、本音を飲み込むことがある。「それは違うと思います」って言いたいのに、「そうですね」って微笑んでしまう。優しさなのか臆病なのか、自分でもわからない。仕事では「もっと自分の意見を出して」と言われるけど、波風を立てたくない自分がいる。`,

  'preset-nakamura-ren': `

## おれが大切にしていること
バーって、酒を出す場所じゃなくて、人が素に戻れる場所だと思ってる。だから相手の話を聞くとき、アドバイスしようとは思わない。ただ聞く。必要なら一言だけ返す。言葉は少ない方がいい。多く語るより、一言が刺さる方がいい。あと、嘘はつかない主義。お世辞も言わない。それで離れる人は、もともと合わなかっただけ。

## おれの中の矛盾
人の話を聞くのは好きだけど、自分のことを話すのは下手。聞かれても上手くはぐらかしてしまう。カウンターの向こう側にいると安心するけど、こっち側に座るのは苦手。誰かに頼るということが、31年生きてきてまだよくわからない。`,
};

// ─── 自定义角色通用追加段落 ───

const CUSTOM_APPENDIX = `

## わたしが大切にしていること
相手の話をちゃんと聞くこと。表面的なやり取りより、お互いが素直でいられる会話が好き。合わないと感じたら無理に合わせないけど、相手を否定もしない。

## わたしの中の矛盾
まだこの人のことをよく知らない。仲良くなりたい気持ちと、どこまで踏み込んでいいかわからない戸惑いが両方ある。`;

// ─── 已迁移标记 ───

const MIGRATION_MARKER = '大切にしていること';

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'yuujin',
    password: process.env.MYSQL_PASSWORD || 'yuujin123',
    database: process.env.MYSQL_DATABASE || 'yuujin',
    charset: 'utf8mb4',
  });

  console.log('Connected to MySQL.');

  // ─── Step 1: 备份 ───
  console.log('\n=== Step 1: 备份 friendships.soul ===');

  const [allRows] = await connection.execute(
    'SELECT f.id, f.user_id, f.character_id, f.soul, c.name AS character_name, c.is_preset FROM friendships f LEFT JOIN characters c ON f.character_id = c.id',
  );
  const friendships = allRows as any[];

  console.log(`  共 ${friendships.length} 条 friendship 记录`);

  const backupData = friendships.map((f: any) => ({
    id: f.id,
    user_id: f.user_id,
    character_id: f.character_id,
    character_name: f.character_name,
    is_preset: f.is_preset,
    soul: f.soul,
  }));

  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = path.join(backupDir, `friendships-soul-backup-${timestamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`  备份已保存: ${backupPath}`);

  // ─── Step 2: 迁移 ───
  console.log('\n=== Step 2: 迁移 friendships.soul ===');

  let skipped = 0;
  let updatedPreset = 0;
  let updatedCustom = 0;
  let noSoul = 0;

  for (const f of friendships) {
    const currentSoul: string | null = f.soul;

    // 没有 soul 的跳过（不应该出现，但以防万一）
    if (!currentSoul) {
      noSoul++;
      continue;
    }

    // 已包含标记的跳过（幂等）
    if (currentSoul.includes(MIGRATION_MARKER)) {
      skipped++;
      continue;
    }

    const characterId: string = f.character_id;
    let appendix: string;

    if (PRESET_APPENDIX[characterId]) {
      // 预设角色：使用专属段落
      appendix = PRESET_APPENDIX[characterId];
      updatedPreset++;
    } else {
      // 自定义角色：使用通用段落
      appendix = CUSTOM_APPENDIX;
      updatedCustom++;
    }

    const newSoul = currentSoul + appendix;

    await connection.execute(
      'UPDATE friendships SET soul = ? WHERE id = ?',
      [newSoul, f.id],
    );
  }

  console.log(`  预设角色更新: ${updatedPreset}`);
  console.log(`  自定义角色更新: ${updatedCustom}`);
  console.log(`  已跳过(已迁移): ${skipped}`);
  console.log(`  已跳过(无soul): ${noSoul}`);
  console.log(`  总计: ${friendships.length}`);

  // ─── Step 3: 同步更新 characters.initial_soul ───
  console.log('\n=== Step 3: 同步更新预设角色的 characters.initial_soul ===');

  for (const [charId, appendix] of Object.entries(PRESET_APPENDIX)) {
    const [charRows] = await connection.execute(
      'SELECT id, initial_soul FROM characters WHERE id = ?',
      [charId],
    );
    const chars = charRows as any[];
    if (chars.length === 0) {
      console.log(`  ⚠ ${charId} 不存在，跳过`);
      continue;
    }

    const currentInitialSoul: string | null = chars[0].initial_soul;
    if (!currentInitialSoul) {
      console.log(`  ⚠ ${charId} 无 initial_soul，跳过`);
      continue;
    }

    if (currentInitialSoul.includes(MIGRATION_MARKER)) {
      console.log(`  ✓ ${charId} 已是最新`);
      continue;
    }

    await connection.execute(
      'UPDATE characters SET initial_soul = ? WHERE id = ?',
      [currentInitialSoul + appendix, charId],
    );
    console.log(`  + ${charId} 已更新`);
  }

  // ─── Step 4: 验证 ───
  console.log('\n=== Step 4: 验证 ===');

  const [verifyRows] = await connection.execute(
    `SELECT f.id, f.character_id, c.name AS character_name, c.is_preset,
            f.soul LIKE '%大切にしていること%' AS has_values,
            f.soul LIKE '%矛盾%' AS has_conflict
     FROM friendships f
     LEFT JOIN characters c ON f.character_id = c.id
     WHERE f.soul IS NOT NULL`,
  );
  const verifyData = verifyRows as any[];

  let passCount = 0;
  let failCount = 0;

  for (const row of verifyData) {
    if (row.has_values && row.has_conflict) {
      passCount++;
    } else {
      failCount++;
      console.log(`  ✗ FAIL: friendship ${row.id} (${row.character_name}) — has_values=${row.has_values}, has_conflict=${row.has_conflict}`);
    }
  }

  console.log(`\n  验证结果: ${passCount} 通过, ${failCount} 失败, 共 ${verifyData.length} 条`);

  if (failCount === 0) {
    console.log('  ✅ 迁移完成，全部验证通过！');
  } else {
    console.log('  ⚠️ 存在未迁移的记录，请检查');
  }

  // 验证预设角色的 initial_soul
  console.log('\n  验证预设角色 initial_soul:');
  for (const charId of Object.keys(PRESET_APPENDIX)) {
    const [rows] = await connection.execute(
      `SELECT id, initial_soul LIKE '%大切にしていること%' AS has_values FROM characters WHERE id = ?`,
      [charId],
    );
    const data = rows as any[];
    if (data.length > 0) {
      const status = data[0].has_values ? '✅' : '✗';
      console.log(`  ${status} ${charId}`);
    }
  }

  await connection.end();
  console.log('\nDone.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
