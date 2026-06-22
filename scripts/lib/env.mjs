/**
 * 加载 skill 根目录下的 .env（KEY=VALUE，不依赖 dotenv 包）
 * 不覆盖 process.env 里已有的变量（shell export 优先）
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

let loaded = false;

export function loadEnv() {
  if (loaded) return;
  loaded = true;
  const path = join(SKILL_ROOT, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

export function envPath() {
  return join(SKILL_ROOT, '.env');
}

export function hasEnvFile() {
  return existsSync(envPath());
}
