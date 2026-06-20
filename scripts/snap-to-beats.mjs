#!/usr/bin/env node
// 卡点：把 montage.json 序列的剪辑点吸附到音乐节拍上
// 用法:
//   node scripts/snap-to-beats.mjs <montage.json> <beats.json> [out.json] [--every N] [--min 0.4] [--max 6]
// 行为: 每个镜头的"切点"对齐到节拍网格（每 N 拍一刀），调整 dur/out；音轨写进 music。
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const pos = args.filter(a => !a.startsWith('--'));
const [montagePath, beatsPath, outArg] = pos;
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const EVERY = Math.max(1, opt('--every', 1));   // 每几拍一刀
const MIN = opt('--min', 0.4);                   // 单镜头最短
const MAX = opt('--max', Infinity);              // 单镜头最长
if (!montagePath || !beatsPath) {
  console.error('用法: node scripts/snap-to-beats.mjs <montage.json> <beats.json> [out.json] [--every N] [--min 0.4] [--max 6]');
  process.exit(1);
}

const montage = JSON.parse(await readFile(resolve(montagePath), 'utf8'));
const beatsData = JSON.parse(await readFile(resolve(beatsPath), 'utf8'));
const allBeats = (beatsData.beats || []).filter(b => b > 0);
const grid = allBeats.filter((_, i) => i % EVERY === 0);   // 取每 N 拍

const seq = (montage.sequence || []).filter(s => s.enabled !== false);
let playhead = 0, gi = 0, snapped = 0;

for (const s of seq) {
  const minEnd = playhead + MIN;
  while (gi < grid.length && grid[gi] < minEnd) gi++;        // 找下一个 >= 最短时长的拍点
  let target = grid[gi];
  if (target == null || target - playhead > MAX) {
    // 没有合适拍点（音乐放完/超过最长）→ 保持原时长不强切
    const dur = s.dur || ((s.out || 0) - (s.in || 0)) || 2;
    s.beatAligned = false; playhead += dur; continue;
  }
  const dur = Math.round((target - playhead) * 1000) / 1000;
  s.in = s.in || 0;
  s.out = Math.round((s.in + dur) * 1000) / 1000;
  s.dur = dur;
  s.beatAligned = true;
  playhead = target; gi++; snapped++;
}

montage.music = montage.music || {};
montage.music.src = beatsData.src || montage.music.src;
montage.music.bpm = beatsData.bpm || montage.music.bpm;
montage.music.beats = allBeats;
montage.music.beatSync = { every: EVERY, snapped, totalDuration: Math.round(playhead * 1000) / 1000 };
montage.targetDuration = montage.targetDuration || Math.round(playhead);

const out = outArg || montagePath;
await writeFile(resolve(out), JSON.stringify(montage, null, 2), 'utf8');
console.log(`[draftcut] 卡点完成 → ${out} （对齐 ${snapped}/${seq.length} 段, 每 ${EVERY} 拍一刀, 总时长 ${playhead.toFixed(2)}s）`);
