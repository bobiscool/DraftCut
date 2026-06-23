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
    const bin = have('whisper-cli') ? 'whisper-cli' : 'whisper-cpp';
    const model = tcfg.cppModel || process.env.WHISPER_CPP_MODEL;
    if (!model) throw new Error('whisper.cpp 需要模型路径：设 transcribe.cppModel 或环境变量 WHISPER_CPP_MODEL');
    const base = join(dir, 'out');
    const r = spawnSync(bin, ['-m', model, '-f', wav, '-oj', '-of', base, ...(LANG ? ['-l', LANG] : [])], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error((r.stderr || r.stdout || '').slice(0, 400));
    const j = JSON.parse(readFileSync(base + '.json', 'utf8'));
    const segs = (j.transcription || []).map(t => ({
      start: (t.offsets?.from ?? 0) / 1000, end: (t.offsets?.to ?? 0) / 1000, text: (t.text || '').trim(),
    }));
    return { language: j.result?.language || LANG, text: segs.map(s => s.text).join(''), segments: segs };
  }
  throw new Error('unknown backend ' + backend);
}

// 折叠段内连续重复词/字（"Ukrain Ukrain Ukrain" → "Ukrain"）
function collapseRepeats(text) {
  if (!text) return text;
  if (/\s/.test(text)) {
    const toks = text.trim().split(/\s+/);
    const out = []; for (const w of toks) if (out[out.length - 1] !== w) out.push(w);
    return out.join(' ');
  }
  return text.replace(/(.{1,8}?)\1{3,}/g, '$1'); // 无空格(CJK)：≥4 次连续重复短串→1 次
}

// whisper 在无人声/纯音乐上常产生重复幻觉（同一句刷屏）。过滤掉。
function dehallucinate(t) {
  if (!t || !t.segments) return t;
  // 折叠相邻重复段 + 段内重复词
  const segs = [];
  for (const s0 of t.segments) {
    const s = { ...s0, text: collapseRepeats(s0.text) };
    const prev = segs[segs.length - 1];
    if (prev && prev.text === s.text) { prev.end = s.end; continue; }
    segs.push(s);
  }
  // 若某一句占了绝大多数段，判为无效语音
  const counts = {};
  for (const s of segs) counts[s.text] = (counts[s.text] || 0) + 1;
  const top = Math.max(0, ...Object.values(counts));
  if (segs.length >= 3 && top / segs.length > 0.6) {
    return { ...t, segments: [], text: '', note: 'no-speech(hallucination filtered)' };
  }
  const joined = segs.map(s => s.text).join(' ').trim();
  // 折叠后只剩标点/符号，或有效字符过短 → 视为无语音
  const meaningful = joined.replace(/[\s.,!?；。，！？、…·\-_*]/g, '');
  if (meaningful.length < 6) {
    return { ...t, segments: [], text: '', note: 'no-speech(too-short)' };
  }
  return { ...t, segments: segs, text: joined };
}

const backend = detectBackend();
if (!backend) {
  console.error('[draftcut] 未找到 whisper 后端。安装其一：');
  console.error('  · Apple Silicon(推荐): pip install mlx-whisper');
  console.error('  · 通用:               pip install -U openai-whisper');
  console.error('  · 快速:               pip install faster-whisper');
  console.error('  · C++:                brew install whisper-cpp（再设 WHISPER_CPP_MODEL 指向 ggml 模型）');
  process.exit(3);
}

const shotsDoc = (() => { try { return JSON.parse(readFileSync(join(WORK, 'shots.json'), 'utf8')); } catch { return { shots: [] }; } })();
const videos = [...new Set((shotsDoc.shots || []).map(s => s.src))];
if (!videos.length) { console.error('[draftcut] shots.json 为空，请先 scan'); process.exit(2); }
const transcriptPath = join(WORK, 'transcripts.json');
const existingDoc = (() => { try { return JSON.parse(readFileSync(transcriptPath, 'utf8')); } catch { return { videos: [] }; } })();
const existingBySrc = new Map((existingDoc.videos || []).map(v => [v.src, v]));

function hasAudio(video) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', video], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}

writeProgress(WORK, { phase: 'transcribe', phaseLabel: '音频转写', totalFiles: videos.length, fileIndex: 0, message: `whisper 后端=${backend}, 模型=${MODEL}` });
const out = [];
function savePartial() {
  writeFileSync(transcriptPath, JSON.stringify({ transcribedAt: new Date().toISOString(), backend, model: MODEL, videos: out }, null, 2));
}
for (let i = 0; i < videos.length; i++) {
  const video = videos[i];
  const existing = existingBySrc.get(video);
  if (existing) {
    out.push(existing);
    writeProgress(WORK, { phase: 'transcribe', totalFiles: videos.length, fileIndex: i + 1, currentFile: basename(video), message: '已存在，跳过' });
    continue;
  }
  writeProgress(WORK, { phase: 'transcribe', totalFiles: videos.length, fileIndex: i + 1, currentFile: basename(video), message: '检查音轨' });
  if (!hasAudio(video)) { out.push({ src: video, file: basename(video), language: '', text: '', segments: [], note: 'no-audio' }); savePartial(); continue; }
  writeProgress(WORK, { phase: 'transcribe', totalFiles: videos.length, fileIndex: i + 1, currentFile: basename(video), message: `提取音频 + ${backend} 转写中` });
  try {
    const { dir, wav } = extractAudio(video);
    const t = dehallucinate(runBackend(backend, wav, dir));
    out.push({ src: video, file: basename(video), backend, ...t });
    writeProgress(WORK, { phase: 'transcribe', totalFiles: videos.length, fileIndex: i + 1, currentFile: basename(video), message: `${(t.segments || []).length} 段文字` });
  } catch (e) {
    console.error(`[draftcut] ${basename(video)} 转写失败: ${e.message}`);
    out.push({ src: video, file: basename(video), language: '', text: '', segments: [], error: e.message });
  }
  savePartial();
}

savePartial();
writeProgress(WORK, { phase: 'transcribe', totalFiles: videos.length, fileIndex: videos.length, message: `完成 -> transcripts.json` });
