#!/usr/bin/env node
// 阶段7 · 导出 EXPORT → 剪映 draft（draft_content.json + draft_meta_info.json）
// 用法: node scripts/export-jianying.mjs <montage.json> <out_dir> [shots.json]
// ⚠️ 剪映草稿格式随版本变化，本脚本生成的是"已知结构的最小骨架"，
//    导出后请在目标剪映版本里打开确认；必要时对齐对应版本 schema（或借助 pyJianYingDraft）。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';

const [, , dataPath, outDir, shotsPath] = process.argv;
if (!dataPath || !outDir) {
  console.error('用法: node scripts/export-jianying.mjs <montage.json> <out_dir> [shots.json]');
  process.exit(1);
}
const US = s => Math.round(s * 1e6);           // 秒 → 微秒（剪映时间单位）
const uid = () => randomUUID().toUpperCase();

const montage = JSON.parse(await readFile(resolve(dataPath), 'utf8'));
let shots = {};
if (shotsPath) {
  try { const arr = JSON.parse(await readFile(resolve(shotsPath), 'utf8'));
    for (const sh of (arr.shots || arr)) shots[sh.id] = sh; } catch {}
}
const seq = (montage.sequence || []).filter(s => s.enabled !== false);

const videos = [];      // materials.videos
const segments = [];    // 主视频轨 segments
let playhead = 0;

for (const s of seq) {
  const sh = shots[s.shotId] || {};
  const src = s.src || sh.src || `MISSING/${s.shotId || 'clip'}.mp4`;
  const dur = s.dur || ((s.out || 0) - (s.in || 0)) || 2;
  const srcStart = (sh.start || 0) + (s.in || 0);
  const matId = uid();
  videos.push({
    id: matId, type: 'video', path: resolve(src), material_name: basename(src),
    duration: US((sh.dur || dur) + 0), width: sh.width || 1920, height: sh.height || 1080,
  });
  segments.push({
    id: uid(), material_id: matId,
    source_timerange: { start: US(srcStart), duration: US(dur) },
    target_timerange: { start: US(playhead), duration: US(dur) },
    speed: 1.0, volume: 1.0, visible: true,
    extra_montage: { role: s.role, rationale: s.rationale, transitionOut: s.transitionOut },
  });
  playhead += dur;
}

const draftId = uid();
const draft_content = {
  id: draftId,
  draft_fold_path: resolve(outDir),
  duration: US(playhead),
  canvas_config: { width: 1080, height: 1920, ratio: montage.aspect || '9:16' },
  materials: { videos, audios: [], texts: [], stickers: [] },
  tracks: [
    { id: uid(), type: 'video', segments },
  ],
  // 配乐仅作标注，不写入音频轨（按你的要求不渲染配乐）
  extra_info: { tool: 'montage', music_suggestion: montage.music || null, brief: montage.brief || '' },
};

const draft_meta_info = {
  draft_id: draftId,
  draft_name: (montage.brief || 'montage').slice(0, 40),
  draft_fold_path: resolve(outDir),
  tm_duration: US(playhead),
  draft_root_path: '',
};

await mkdir(resolve(outDir), { recursive: true });
await writeFile(resolve(outDir, 'draft_content.json'), JSON.stringify(draft_content, null, 2), 'utf8');
await writeFile(resolve(outDir, 'draft_meta_info.json'), JSON.stringify(draft_meta_info, null, 2), 'utf8');
console.log(`[draftcut] 剪映 draft 写入 ${outDir} （${seq.length} 段, ${playhead.toFixed(1)}s）`);
console.log('[draftcut] 把该目录放进剪映草稿目录后重启剪映即可看到；配乐仅在 extra_info 标注，未写入音频轨。');
if (videos.some(v => v.path.includes('MISSING'))) {
  console.warn('[draftcut] ⚠️ 有镜头缺源文件：导出时带上 shots.json，或在 montage.json 段里补 "src"。');
}
