#!/usr/bin/env node
/**
 * 阶段2 · 析 READ —— 用 user-endpoint（OpenAI 兼容多模态，如 Qwen-VL）给镜头打标签
 * 落实 SKILL.md 阶段2 的 user-endpoint 分支。
 *
 * 用法:
 *   node scripts/read-shots.mjs <work_dir> [--config draftcut.config.json]
 *
 * 输入: work/shots.json + work/thumbs/
 * 输出: work/analysis.json（每镜头 {id, summary, subjects, scene, motion, mood, quality, highlight, tags, analyzedBy}）
 *
 * 做法: 按源视频分组 → 把该视频的关键帧拼 contact sheet → 连同该视频的镜头(id/start/end)
 *       一次喂给多模态端点 → 端点按 shot id 返回标签 → 合并写 analysis.json。
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeProgress, readRun } from './lib/progress.mjs';
import { loadEnv } from './lib/env.mjs';
import { t, normalizeLang, buildReadPrompt } from './lib/i18n.mjs';

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cfgIdx = args.indexOf('--config');
const cfgValue = cfgIdx >= 0 ? args[cfgIdx + 1] : null;
const cfgValueIdx = cfgIdx >= 0 ? cfgIdx + 1 : -1;
const positional = args.filter((a, i) => !a.startsWith('--') && i !== cfgValueIdx);
const WORK = resolve(positional[0] || 'work');

function findConfig() {
  const c = [
    cfgValue,
    'draftcut.config.json',
    join(__dirname, '..', 'draftcut.config.json'),
    join(__dirname, '..', 'draftcut.config.example.json'),
  ].filter(Boolean);
  return c.find(existsSync) || c[c.length - 1];
}
function readJson(p, fb = {}) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; } }

const cfg = readJson(resolve(findConfig()));
const mm = cfg.multimodal || {};
const apiKey = mm.apiKeyEnv ? process.env[mm.apiKeyEnv] : undefined;
const baseUrl = mm.baseUrl;
const model = mm.model || 'qwen-vl-plus';

if (!apiKey) {
  console.error(`[draftcut] 缺少 API key：环境变量 ${mm.apiKeyEnv} 未设置。`);
  console.error(`[draftcut] 请 cp .env.example .env 并填写 ${mm.apiKeyEnv}，或 export ${mm.apiKeyEnv}=...`);
  process.exit(2);
}

const shotsDoc = readJson(join(WORK, 'shots.json'), { shots: [], assets: [] });
const assets = (shotsDoc.assets && shotsDoc.assets.length) ? shotsDoc.assets : shotsDoc.shots;
if (!assets.length) { console.error('[draftcut] shots.json 为空，请先跑 scan-folder.mjs'); process.exit(2); }

const transcripts = readJson(join(WORK, 'transcripts.json'), { videos: [] });
const transBySrc = new Map((transcripts.videos || []).map(v => [v.src, v]));

function buildContactSheet(asset) {
  const thumbs = (asset.thumbs || []).filter(existsSync).slice(0, 20);
  if (!thumbs.length) return null;
  const name = basename(asset.src).replace(/\.[^.]+$/, '');
  const out = join(WORK, 'contact_sheets', `${name}.jpg`);
  const cols = 5;
  const rows = Math.ceil(thumbs.length / cols);
  const listFile = join(WORK, 'contact_sheets', `${name}.txt`);
  writeFileSync(listFile, thumbs.map(t => `file '${t}'`).join('\n'));
  try {
    execSync(
      `ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "${listFile}" -vf "scale=320:-1,tile=${cols}x${rows}:padding=6:color=white" -frames:v 1 "${out}"`,
      { stdio: 'pipe' }
    );
  } catch { return null; }
  return { path: out, thumbs };
}

function buildPrompt(asset) {
  const frames = asset.frames || [];
  const frameLines = frames.map((f, i) => {
    const label = lang === 'en' ? `Frame ${i + 1}` : lang === 'ja' ? `フレーム ${i + 1}` : `帧${i + 1}`;
    return `${label} @ ${f.t.toFixed(2)}s`;
  }).join('\n');
  const full = transBySrc.get(asset.src);
  const fullText = full && full.text ? full.text.trim().slice(0, 1500) : '';
  return buildReadPrompt(lang, asset, frameLines, fullText);
}

