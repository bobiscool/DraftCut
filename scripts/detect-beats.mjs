#!/usr/bin/env node
// 用户加音乐 → 检测节拍（BPM + beat 时间点）
// 用法: node scripts/detect-beats.mjs <audio> [out.json] [--bpm N]
// 优先级: aubio(aubiotrack) > python librosa > ffprobe 恒速网格(回退, 需 --bpm 或默认 120)
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const audio = args.find(a => !a.startsWith('--'));
const outPath = args.filter(a => !a.startsWith('--'))[1];
const bpmArg = (() => { const i = args.indexOf('--bpm'); return i >= 0 ? Number(args[i + 1]) : null; })();
if (!audio) { console.error('用法: node scripts/detect-beats.mjs <audio> [out.json] [--bpm N]'); process.exit(1); }

const run = (cmd, a) => execFileSync(cmd, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const has = cmd => { try { run(cmd, ['--help']); return true; } catch (e) { return e.status !== undefined; } };

function duration(file) {
  try {
    return parseFloat(run('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1', file]).trim());
  } catch { return null; }
}
const median = xs => { const s=[...xs].sort((a,b)=>a-b); return s.length? s[s.length>>1]:0; };
const bpmFromBeats = b => b.length>1 ? Math.round(60/median(b.slice(1).map((t,i)=>t-b[i]))) : null;

let beats = null, method = null, bpm = bpmArg;

// 1) aubio
try {
  const out = run('aubiotrack', [resolve(audio)]);
  const b = out.split('\n').map(s=>parseFloat(s.trim())).filter(n=>!isNaN(n));
  if (b.length > 4) { beats = b; method = 'aubio'; }
} catch {}

// 2) librosa
if (!beats) {
  try {
    const py = `import sys,librosa,json
y,sr=librosa.load(sys.argv[1])
t,bs=librosa.beat.beat_track(y=y,sr=sr,units='time')
print(json.dumps({"bpm":float(t),"beats":[float(x) for x in bs]}))`;
    const out = run('python3', ['-c', py, resolve(audio)]);
    const j = JSON.parse(out); beats = j.beats; bpm = bpm || Math.round(j.bpm); method = 'librosa';
  } catch {}
}

// 3) 恒速网格回退
if (!beats) {
  const dur = duration(audio) || 60;
  const useBpm = bpm || 120;
  const step = 60 / useBpm;
  beats = []; for (let t=0; t<dur; t+=step) beats.push(Math.round(t*1000)/1000);
  bpm = useBpm; method = 'grid';
  console.warn(`[draftcut] ⚠️ 未装 aubio/librosa，回退恒速网格 @ ${useBpm} BPM（可能不准）。建议: brew install aubio  或  pip install librosa`);
}

bpm = bpm || bpmFromBeats(beats);
const result = { src: resolve(audio), bpm, method, beats };
const json = JSON.stringify(result, null, 2);
if (outPath) { await writeFile(resolve(outPath), json, 'utf8'); console.log(`[draftcut] 节拍写入 ${outPath} （${method}, ${bpm} BPM, ${beats.length} 拍）`); }
else console.log(json);
