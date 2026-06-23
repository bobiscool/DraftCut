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

  const resolveArgs = [work];
  if (CONFIG) resolveArgs.push('--config', CONFIG);
  code = await runChild('resolve-vision.mjs', resolveArgs);
  if (runId !== pipelineRun) return;
  if (code === 10) {
    writeProgress(work, { phase: 'read', language: lang, message: '等待确认 agent 读帧后端…' });
    return;
  }
  if (code !== 0) return;

  const readArgs = [work];
  if (CONFIG) readArgs.push('--config', CONFIG);
  code = await runChild('read-shots.mjs', readArgs);
  if (runId !== pipelineRun || code !== 0) return;

  writeProgress(work, { phase: 'seq', language: lang, message: t(lang, 'msg_seq') });
}

function startScan(sourceDir, opts = {}) {
  if (scanProcess && scanProcess.exitCode == null) scanProcess.kill('SIGTERM');
  const { source, work } = resetWorkForSource(sourceDir, opts.workDir, opts);
  const runId = ++pipelineRun;
  runPipeline(runId, source, work, opts).catch(err => {
    writeProgress(work, { phase: 'scan', language: normalizeLang(opts.language), message: err.message || String(err) });
  });
  return { source, work, pid: scanProcess?.pid || null };
}

function pickFolder() {
  if (process.platform !== 'darwin') {
    throw new Error('folder picker is only implemented for macOS right now');
  }
  const r = spawnSync('/usr/bin/osascript', [
    '-e',
    'POSIX path of (choose folder with prompt "Choose a media folder for DraftCut")',
  ], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || 'cancelled').trim());
  return r.stdout.trim().replace(/\/$/, '');
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const path = u.pathname;
  try {
    if (path === '/' || path === '/index.html') {
      return send(res, 200, buildHtml(req), { 'content-type': 'text/html; charset=utf-8' });
    }
    if (path === '/file') {
      const p = u.searchParams.get('path');
      if (!p) return send(res, 400, 'missing path');
      return serveFile(req, res, decodeURIComponent(p));
    }
    if (path === '/api/montage' && req.method === 'GET') {
      const data = existsSync(montagePath()) ? readFileSync(montagePath(), 'utf8') : '{}';
      return send(res, 200, data, { 'content-type': 'application/json' });
    }
    if (path === '/api/montage' && req.method === 'POST') {
      const body = await readBody(req);
      JSON.parse(body); // 校验
      await writeFile(montagePath(), body, 'utf8');
      return send(res, 200, JSON.stringify({ ok: true, saved: montagePath() }), { 'content-type': 'application/json' });
    }
    if (path === '/api/export' && req.method === 'POST') {
      const target = u.searchParams.get('target');
      const m = rj(montagePath(), {});
      const name = slug(m.brief || m.style || 'montage');
      const exportDir = join(WORK, 'export');
      await mkdir(exportDir, { recursive: true });
      const shotsArg = existsSync(shotsPath()) ? [shotsPath()] : [];
      let out, result;
      if (target === 'fcpxml') {
        out = join(exportDir, `${name}.fcpxml`);
        result = await runScript([join(__dirname, 'export-fcpxml.mjs'), montagePath(), out, ...shotsArg]);
      } else if (target === 'jianying') {
        out = join(exportDir, 'jianying', name);
        result = await runScript([join(__dirname, 'export-jianying.mjs'), montagePath(), out, ...shotsArg]);
      } else {
        return send(res, 400, JSON.stringify({ error: 'unknown target' }), { 'content-type': 'application/json' });
      }
      if (result.code !== 0) return send(res, 500, JSON.stringify({ error: result.log || 'export failed' }), { 'content-type': 'application/json' });
      return send(res, 200, JSON.stringify({ ok: true, out, log: result.log }), { 'content-type': 'application/json' });
    }
    if (path === '/api/progress') {
      const data = existsSync(join(WORK, 'progress.json')) ? readFileSync(join(WORK, 'progress.json'), 'utf8') : '{}';
      return send(res, 200, data, { 'content-type': 'application/json' });
    }
    if (path === '/api/analysis') {
      const p = join(WORK, 'analysis.json');
      const data = existsSync(p) ? readFileSync(p, 'utf8') : '{}';
      return send(res, 200, data, { 'content-type': 'application/json' });
    }
    if (path === '/api/shots') {
      const data = existsSync(shotsPath()) ? readFileSync(shotsPath(), 'utf8') : '{}';
      return send(res, 200, data, { 'content-type': 'application/json' });
    }
    if (path === '/api/work') {
      return send(res, 200, JSON.stringify({ work: WORK, roots: allowedRoots(), scanning: !!(scanProcess && scanProcess.exitCode == null) }), { 'content-type': 'application/json' });
    }
    if (path === '/api/start-scan' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.sourceDir) return send(res, 400, JSON.stringify({ error: 'missing sourceDir' }), { 'content-type': 'application/json' });
      const started = startScan(body.sourceDir, body);
      return send(res, 200, JSON.stringify({ ok: true, ...started }), { 'content-type': 'application/json' });
    }
    if (path === '/api/pick-folder' && req.method === 'POST') {
      const folder = pickFolder();
      return send(res, 200, JSON.stringify({ ok: true, folder }), { 'content-type': 'application/json' });
    }
    if (path === '/api/run' && req.method === 'GET') {
      const data = existsSync(join(WORK, 'run.json')) ? readFileSync(join(WORK, 'run.json'), 'utf8') : '{}';
      return send(res, 200, data, { 'content-type': 'application/json' });
    }
    if (path === '/api/run' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const prev = rj(join(WORK, 'run.json'), {});
      const next = { ...prev, ...body, language: normalizeLang(body.language || body.lang || prev.language) };
      writeFileSync(join(WORK, 'run.json'), JSON.stringify(next, null, 2));
      return send(res, 200, JSON.stringify({ ok: true, language: next.language }), { 'content-type': 'application/json' });
    }
    send(res, 404, 'not found');
  } catch (e) {
    send(res, 500, JSON.stringify({ error: String(e.message || e) }), { 'content-type': 'application/json' });
  }
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/`;
  console.error(`[draftcut] storyboard 服务: ${url}`);
  console.error(`[draftcut] work=${WORK}`);
  console.error(`[draftcut] 允许素材根目录:`);
  for (const r of allowedRoots()) console.error(`           ${r}`);
  if (has('--open')) spawn('open', [url]);
});
