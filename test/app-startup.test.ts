import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * 集成测试：验证所有模块都已正确注册
 *
 * 防止新增模块时遗漏 config/module.json 或 package.json 的问题，
 * 避免线上应用启动崩溃。
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const MODULE_DIR = path.join(ROOT, 'app', 'module');
const MODULE_JSON = path.join(ROOT, 'config', 'module.json');

describe('App module registration', () => {

  let registeredModules: string[];
  let diskModules: string[];

  before(() => {
    // 从 config/module.json 读取已注册的模块路径
    const raw = JSON.parse(fs.readFileSync(MODULE_JSON, 'utf8')) as { path: string }[];
    registeredModules = raw.map(entry => {
      // "../app/module/auth" → "auth"
      const parts = entry.path.split('/');
      return parts[parts.length - 1];
    });

    // 扫描 app/module/ 下所有含 package.json 的子目录
    diskModules = fs.readdirSync(MODULE_DIR).filter(name => {
      const dir = path.join(MODULE_DIR, name);
      return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'package.json'));
    });
  });

  it('every module directory should have a package.json with eggModule', () => {
    const allDirs = fs.readdirSync(MODULE_DIR).filter(name =>
      fs.statSync(path.join(MODULE_DIR, name)).isDirectory(),
    );

    const missing: string[] = [];
    const invalid: string[] = [];

    for (const name of allDirs) {
      const pkgPath = path.join(MODULE_DIR, name, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        missing.push(name);
        continue;
      }
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (!pkg.eggModule?.name) {
        invalid.push(name);
      }
    }

    assert.deepStrictEqual(missing, [],
      `模块目录缺少 package.json: ${missing.join(', ')}`);
    assert.deepStrictEqual(invalid, [],
      `模块 package.json 缺少 eggModule.name: ${invalid.join(', ')}`);
  });

  it('every module with package.json should be registered in config/module.json', () => {
    const unregistered = diskModules.filter(name => !registeredModules.includes(name));

    assert.deepStrictEqual(unregistered, [],
      `以下模块有 package.json 但未在 config/module.json 中注册: ${unregistered.join(', ')}。` +
      '新增模块后必须同步更新 config/module.json，否则线上应用会启动失败。');
  });

  it('config/module.json should not reference non-existent modules', () => {
    const allDirs = fs.readdirSync(MODULE_DIR).filter(name =>
      fs.statSync(path.join(MODULE_DIR, name)).isDirectory(),
    );
    const ghost = registeredModules.filter(name => !allDirs.includes(name));

    assert.deepStrictEqual(ghost, [],
      `config/module.json 引用了不存在的模块: ${ghost.join(', ')}`);
  });
});
