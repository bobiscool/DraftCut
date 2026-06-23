#!/usr/bin/env node
/**
 * 一键跑解析流水线：先起 storyboard 网页 → 边扫边展示进度 → scan → transcribe → read
 *
 * 用法:
 *   node scripts/run.mjs <素材目录> [work_dir] [--brief "一句话目标"] [--duration 60] [--port 8787] [--open] [--skip-transcribe]
 *
 * 编排(montage)仍由 agent 在 analysis 完成后做（阶段4），网页会在 montage.json 出现后热加载（无需整页刷新）。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeRun, writeProgress } from './lib/progress.mjs';
import { loadEnv } from './lib/env.mjs';
import { normalizeLang, t } from './lib/i18n.mjs';

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const has = name => args.includes(name);
const skipTranscribe = has('--skip-transcribe');
const cfgIdx = args.indexOf('--config');
const cfgValueIdx = cfgIdx >= 0 ? cfgIdx + 1 : -1;
const positional = args.filter((a, i) => !a.startsWith('--') && i !== cfgValueIdx
  && args[i - 1] !== '--port' && args[i - 1] !== '--brief' && args[i - 1] !== '--duration' && args[i - 1] !== '--config');

const SRC = resolve(positional[0] || '.');
const WORK = resolve(positional[1] || join(SRC, 'work'));
const brief = flag('--brief', '');
const targetDuration = parseFloat(flag('--duration', '0')) || null;
const language = flag('--lang', flag('--language', 'zh'));
const PORT = parseInt(flag('--port', '8787'), 10);
const configArg = flag('--config', null);

function runNode(script, scriptArgs = [], inherit = true) {
  return new Promise((res) => {
    const p = spawn('node', [join(__dirname, script), ...scriptArgs], {
      cwd: ROOT,
      stdio: inherit ? 'inherit' : 'pipe',
      env: process.env,
    });
    p.on('close', code => res(code ?? 1));
  });
}

function startServe() {
  const serveArgs = [join(__dirname, 'serve.mjs'), WORK, '--port', String(PORT)];
  if (configArg) serveArgs.push('--config', configArg);
  if (has('--open')) serveArgs.push('--open');
  const p = spawn('node', serveArgs, { cwd: ROOT, stdio: 'inherit', detached: false });
  return p;
}

async function main() {
  if (!existsSync(SRC)) {
    console.error(`[draftcut] 素材目录不存在: ${SRC}`);
    process.exit(2);
  }

  writeRun(WORK, { brief, targetDuration, sourceDir: SRC, language: normalizeLang(language) });
  writeProgress(WORK, { phase: 'scan', language: normalizeLang(language), message: t(normalizeLang(language), 'msg_scan_start') });

  const serveProc = startServe();
  await new Promise(r => setTimeout(r, 800));
  console.error(`[draftcut] 预览页 http://localhost:${PORT}/ （解析进度实时显示）`);

  let code = await runNode('scan-folder.mjs', [SRC, WORK]);
  if (code !== 0) process.exit(code);

  if (!skipTranscribe) {
    code = await runNode('transcribe.mjs', [WORK]);
    if (code !== 0) console.error('[draftcut] transcribe 失败，继续读帧（无语音上下文）');
  }

  const visionArgs = [WORK];
  if (configArg) visionArgs.push('--config', configArg);
  code = await runNode('resolve-vision.mjs', visionArgs);
  if (code === 10) {
    console.error('[draftcut] 读帧后端=agent，需用户确认。确认后: node scripts/read-shots.mjs', WORK);
    writeProgress(WORK, { phase: 'read', message: '等待确认 agent 读帧后端…' });
    process.exit(10);
  }

  const readArgs = [WORK];
  if (configArg) readArgs.push('--config', configArg);
  code = await runNode('read-shots.mjs', readArgs);
  if (code !== 0) process.exit(code);

  writeProgress(WORK, { phase: 'seq', message: `素材分析完成，等待编排（目标时长 ${targetDuration || '待定'}s）` });
  console.error('[draftcut] 解析完成 → work/analysis.json');
  console.error('[draftcut] 下一步: agent 读 analysis 做 montage（须先定 brief + 目标时长）');
  console.error(`[draftcut] 服务仍在 http://localhost:${PORT}/ ，Ctrl+C 停止`);

  serveProc.on('close', c => process.exit(c ?? 0));
}

main().catch(e => { console.error(e); process.exit(1); });
