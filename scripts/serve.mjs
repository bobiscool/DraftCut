#!/usr/bin/env node
/**
 * 阶段5/6 · 本地预览 + 微调 + 导出 服务
 * 起一个本地 http 服务，提供 storyboard（服务模式）：
 *   - 拖拽微调后「💾 保存修改」直接回写 work/montage.json（不用下载-覆盖）
 *   - 「导出 FCPXML / 剪映」一键生成工程到 work/export/
 *   - 本地素材经 /file?path= 代理（支持 Range，<video> 可 seek）
 *
 * 用法: node scripts/serve.mjs <work_dir> [--port 8787] [--config draftcut.config.json] [--open]
 */
import { createServer } from 'node:http';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { writeFileSync, existsSync, readFileSync, statSync, createReadStream, mkdirSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { resolve, join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STR, normalizeLang, t } from './lib/i18n.mjs';
import { writeProgress } from './lib/progress.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(__dirname, '../templates/storyboard.html');

const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const has = name => args.includes(name);
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--port' && args[i - 1] !== '--config');
let WORK = resolve(positional[0] || 'work');
const PORT = parseInt(flag('--port', '8787'), 10);
const montagePath = () => join(WORK, 'montage.json');
const shotsPath = () => join(WORK, 'shots.json');
let scanProcess = null;
let pipelineRun = 0;

function findConfig() {
  const c = [flag('--config', null), 'draftcut.config.json',
    join(__dirname, '..', 'draftcut.config.json'), join(__dirname, '..', 'draftcut.config.example.json')].filter(Boolean);
  return c.find(existsSync) || c[c.length - 1];
}
const CONFIG = resolve(findConfig());

const rj = (p, fb = {}) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; } };

// 允许 /file 访问的根目录：work 目录 + shots.json 的 sourceDir + montage 里出现的 src 所在目录
function allowedRoots() {
  const roots = new Set([WORK]);
  const shots = rj(shotsPath(), {});
  if (shots.sourceDir) roots.add(resolve(shots.sourceDir));
  for (const s of (shots.assets || shots.shots || [])) if (s.src) roots.add(dirname(resolve(s.src)));
  const m = rj(montagePath(), {});
  for (const s of (m.sequence || [])) if (s.src) roots.add(dirname(resolve(s.src)));
  return [...roots];
}

const MIME = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v', '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.heic': 'image/heic', '.HEIC': 'image/heic',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.flac': 'audio/flac',
  '.json': 'application/json', '.html': 'text/html; charset=utf-8' };
const mime = p => MIME[extname(p).toLowerCase()] || 'application/octet-stream';

function buildHtml(req) {
  const tmpl = readFileSync(TEMPLATE, 'utf8');
  const hasMontage = existsSync(montagePath());
  const run = rj(join(WORK, 'run.json'), {});
  let data;
  if (hasMontage) {
    data = readFileSync(montagePath(), 'utf8');
  } else {
    data = JSON.stringify({
      brief: run.brief || '…',
      targetDuration: run.targetDuration || 0,
      sequence: [],
      tracks: [],
    }, null, 0);
  }
  let html = tmpl.replace(/\/\*__DATA_START__\*\/[\s\S]*?\/\*__DATA_END__\*\//,
    `/*__DATA_START__*/ ${data.trim()} /*__DATA_END__*/`);
  const u = req ? new URL(req.url, `http://localhost:${PORT}`) : null;
  const lang = normalizeLang(u?.searchParams.get('lang') || run.language || run.lang || 'zh');
  const doc = u?.searchParams.get('doc') === '1';
  const demoPhase = (u?.searchParams.get('demoPhase') || '').replace(/[^\w-]/g, '');
  const seqLen = hasMontage ? (rj(montagePath()).sequence || []).length : 0;
  const inj = `<script>window.__DRAFTCUT_SERVER__=true;window.__DRAFTCUT_LIVE__=true;window.__DRAFTCUT_LANG__='${lang}';window.__DRAFTCUT_DOC__=${doc};window.__DRAFTCUT_DEMO_PHASE__=${JSON.stringify(demoPhase)};window.__DRAFTCUT_PROGRESS__=${(seqLen && !demoPhase) ? 'false' : 'true'};window.__DRAFTCUT_I18N__=${JSON.stringify(STR)};</script>`;
  html = html.replace('<body>', `<body>\n${inj}`);
  return html;
}

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'cache-control': 'no-store', ...headers });
  res.end(body);
}

function serveFile(req, res, absPath) {
  const roots = allowedRoots();
  const real = resolve(absPath);
  if (!roots.some(r => real === r || real.startsWith(r + '/'))) {
    return send(res, 403, 'forbidden (path outside allowed roots)');
  }
  let st;
  try { st = statSync(real); } catch { return send(res, 404, 'not found'); }
  const type = mime(real);
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
    if (isNaN(start)) start = 0; if (isNaN(end) || end >= st.size) end = st.size - 1;
    if (start > end) return send(res, 416, '', { 'content-range': `bytes */${st.size}` });
    res.writeHead(206, {
      'content-type': type, 'accept-ranges': 'bytes',
      'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1, 'cache-control': 'no-store',
    });
    createReadStream(real, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': st.size, 'cache-control': 'no-store' });
    createReadStream(real).pipe(res);
  }
}

function runScript(scriptArgs) {
  return new Promise((res2) => {
    const p = spawn('node', scriptArgs, { cwd: resolve(__dirname, '..') });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.stdout.on('data', d => { err += d; });
    p.on('close', code => res2({ code, log: err.trim() }));
  });
}

function slug(s) { return (s || 'montage').replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 40); }

function resetWorkForSource(sourceDir, workDir, { brief = '', targetDuration = 0, language = 'zh' } = {}) {
  const source = resolve(sourceDir);
  WORK = resolve(workDir || join(source, 'work'));
  mkdirSync(WORK, { recursive: true });
  for (const name of ['montage.json', 'analysis.json', 'shots.json', 'transcripts.json']) {
    rmSync(join(WORK, name), { force: true });
  }
  writeFileSync(join(WORK, 'run.json'), JSON.stringify({
    brief,
    targetDuration: Number(targetDuration) || 0,
    sourceDir: source,
    language: normalizeLang(language),
    updatedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
  }, null, 2));
  return { source, work: WORK };
}

function runChild(script, scriptArgs = []) {
  return new Promise((resolveCode) => {
    const p = spawn('node', [join(__dirname, script), ...scriptArgs], {
      cwd: resolve(__dirname, '..'),
      stdio: 'ignore',
      env: process.env,
    });
    scanProcess = p;
    p.on('close', code => resolveCode(code ?? 1));
  });
}

async function runPipeline(runId, source, work, opts = {}) {
  const lang = normalizeLang(opts.language);
  let code = await runChild('scan-folder.mjs', [source, work]);
  if (runId !== pipelineRun || code !== 0) return;

  writeProgress(work, { phase: 'transcribe', language: lang, message: t(lang, 'phase_transcribe') });
  code = await runChild('transcribe.mjs', [work, '--lang', lang]);
  if (runId !== pipelineRun) return;
  // Transcription is helpful but not required; visual analysis can continue without it.
