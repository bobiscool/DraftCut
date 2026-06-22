#!/usr/bin/env node
/**
 * 阶段1.5 · 音频转写 TRANSCRIBE —— 用 whisper 把解说/对白转成带时间戳的文字
 * 给"讲解/教程/访谈/vlog"类素材补上声音这一层理解（喂给阶段2 的多模态读图）。
 *
 * 用法: node scripts/transcribe.mjs <work_dir> [--config draftcut.config.json] [--lang zh] [--model small]
 *
 * 输入: work/shots.json（取去重的源视频）
 * 输出: work/transcripts.json：{ videos:[ {src, file, language, text, segments:[{start,end,text}] } ] }
 *
 * 后端自动探测（优先级）: mlx_whisper(Apple) > openai-whisper(whisper) > faster-whisper > whisper.cpp(whisper-cli)
 * 都没有则报错并提示安装方式。
 */
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { writeProgress } from './lib/progress.mjs';
import { loadEnv } from './lib/env.mjs';

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const FLAGS_WITH_VALUE = new Set(['--config', '--lang', '--model']);
const valueIdx = new Set();
args.forEach((a, i) => { if (FLAGS_WITH_VALUE.has(a)) valueIdx.add(i + 1); });
const positional = args.filter((a, i) => !a.startsWith('--') && !valueIdx.has(i));
const WORK = resolve(positional[0] || 'work');

function findConfig() {
  const c = [flag('--config', null), 'draftcut.config.json',
    join(__dirname, '..', 'draftcut.config.json'), join(__dirname, '..', 'draftcut.config.example.json')].filter(Boolean);
  return c.find(existsSync) || c[c.length - 1];
}
const cfg = (() => { try { return JSON.parse(readFileSync(resolve(findConfig()), 'utf8')); } catch { return {}; } })();
const tcfg = cfg.transcribe || {};
const LANG = flag('--lang', tcfg.language || '');
const MODEL = flag('--model', tcfg.model || 'small');

// python：config.transcribe.python > 环境变量 DRAFTCUT_PYTHON > python3（不假设用户目录结构）
const PY = tcfg.python || process.env.DRAFTCUT_PYTHON || 'python3';

function have(cmd) { return spawnSync('bash', ['-lc', `command -v ${cmd}`], { encoding: 'utf8' }).status === 0; }
function havePy(mod) { return spawnSync(PY, ['-c', `import ${mod}`], { encoding: 'utf8' }).status === 0; }

function detectBackend() {
  if (tcfg.backend && tcfg.backend !== 'auto') return tcfg.backend;
  if (havePy('mlx_whisper')) return 'mlx';
  if (have('whisper')) return 'openai';
  if (havePy('faster_whisper')) return 'faster';
  if (have('whisper-cli') || have('whisper-cpp')) return 'cpp';
  return null;
}

function extractAudio(video) {
  const dir = mkdtempSync(join(tmpdir(), 'dc-asr-'));
  const wav = join(dir, 'audio.wav');
  execSync(`ffmpeg -hide_banner -loglevel error -y -i "${video}" -vn -ac 1 -ar 16000 -f wav "${wav}"`);
  return { dir, wav };
}

// 各后端跑完都归一成 {language, text, segments:[{start,end,text}]}
function runBackend(backend, wav, dir) {
  if (backend === 'mlx') {
    const repo = tcfg.mlxModel || 'mlx-community/whisper-' + MODEL;
    const py = `
import json
import mlx_whisper
r = mlx_whisper.transcribe(${JSON.stringify(wav)}, path_or_hf_repo=${JSON.stringify(repo)}, condition_on_previous_text=False${LANG ? `, language=${JSON.stringify(LANG)}` : ''})
out = {"language": r.get("language",""), "text": r.get("text",""),
  "segments": [{"start": s["start"], "end": s["end"], "text": s["text"].strip()} for s in r.get("segments",[])]}
print(json.dumps(out, ensure_ascii=False))
`;
    const r = spawnSync(PY, ['-c', py], { encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 });
    if (r.status !== 0) throw new Error((r.stderr || '').slice(0, 400));
    return JSON.parse(r.stdout);
  }
  if (backend === 'openai') {
    const r = spawnSync('whisper', [wav, '--model', MODEL, '--output_dir', dir, '--output_format', 'json', ...(LANG ? ['--language', LANG] : [])], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error((r.stderr || r.stdout || '').slice(0, 400));
    const jf = readdirSync(dir).find(f => f.endsWith('.json'));
    const j = JSON.parse(readFileSync(join(dir, jf), 'utf8'));
    return { language: j.language || LANG, text: j.text || '', segments: (j.segments || []).map(s => ({ start: s.start, end: s.end, text: (s.text || '').trim() })) };
  }
  if (backend === 'faster') {
    const py = `
import json,sys
from faster_whisper import WhisperModel
m=WhisperModel("${MODEL}",device="auto",compute_type="int8")
segs,info=m.transcribe(${JSON.stringify(wav)}, language=${LANG ? JSON.stringify(LANG) : 'None'})
out={"language":info.language,"segments":[],"text":""}
for s in segs:
    out["segments"].append({"start":s.start,"end":s.end,"text":s.text.strip()})
    out["text"]+=s.text
print(json.dumps(out))
`;
    const r = spawnSync(PY, ['-c', py], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    if (r.status !== 0) throw new Error((r.stderr || '').slice(0, 400));
    return JSON.parse(r.stdout);
  }
  if (backend === 'cpp') {
