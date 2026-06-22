#!/usr/bin/env node
/**
 * 阶段1 · 扫描目录 → shots.json
 * 每个视频/图片 = 一个素材单元(asset)，最多 MAX_FRAMES 张均匀采样帧，用于描述整段情节。
 */
import { execSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeProgress, readRun } from './lib/progress.mjs';
import { t, normalizeLang } from './lib/i18n.mjs';

const MAX_FRAMES = 20;
const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.m4v', '.avi', '.MP4', '.MOV', '.MKV']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.HEIC', '.JPG', '.JPEG', '.PNG']);

const SRC = resolve(process.argv[2] || '.');
const WORK = resolve(process.argv[3] || join(SRC, 'work'));
mkdirSync(join(WORK, 'thumbs'), { recursive: true });

function ffprobe(path) {
  const raw = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,duration -show_entries format=duration -of json "${path}"`,
    { encoding: 'utf8' }
  );
  const j = JSON.parse(raw);
  const s = j.streams?.[0] || {};
  const fpsParts = (s.r_frame_rate || '30/1').split('/');
  const fps = fpsParts.length === 2 ? +fpsParts[0] / +fpsParts[1] : 30;
  const dur = parseFloat(s.duration || j.format?.duration || '0');
  return { width: s.width || 1920, height: s.height || 1080, fps, dur };
}

/** 在 [0,dur) 上均匀取最多 n 个时间点 */
function sampleTimes(dur, n = MAX_FRAMES) {
  if (dur <= 0) return [0];
  const count = Math.min(n, Math.max(1, Math.ceil(dur)));
  if (count === 1) return [0];
  return Array.from({ length: count }, (_, i) => (dur * i) / (count - 1));
}

function extractFrame(video, outPath, t) {
  execSync(
    `ffmpeg -hide_banner -loglevel error -y -ss ${t.toFixed(3)} -i "${video}" -frames:v 1 -vf "scale=320:-1:flags=lanczos,format=yuv420p" -q:v 3 "${outPath}"`,
    { stdio: 'pipe' }
  );
}

function imageToThumb(src, outPath) {
  execSync(
    `ffmpeg -hide_banner -loglevel error -y -i "${src}" -vf "scale=320:-1:flags=lanczos,format=yuv420p" -q:v 3 "${outPath}"`,
    { stdio: 'pipe' }
  );
}

function scanVideo(video, name, idx) {
  const meta = ffprobe(video);
  const times = sampleTimes(meta.dur, MAX_FRAMES);
  const frames = [];
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const thumb = join(WORK, 'thumbs', `${name}_${String(i + 1).padStart(2, '0')}.jpg`);
    try { extractFrame(video, thumb, t); frames.push({ t: Math.round(t * 1000) / 1000, thumb }); }
    catch { /* skip bad frame */ }
  }
  if (!frames.length) {
    const thumb = join(WORK, 'thumbs', `${name}_01.jpg`);
    try { extractFrame(video, thumb, 0); frames.push({ t: 0, thumb }); } catch { return null; }
  }
  return {
    id: `a_${String(idx).padStart(3, '0')}`,
    src: video,
    file: basename(video),
    type: 'video',
    start: 0,
    end: meta.dur,
    dur: meta.dur,
    frames,
    thumbs: frames.map(f => f.thumb),
    width: meta.width,
    height: meta.height,
    fps: meta.fps,
  };
}

function scanImage(image, name, idx) {
  const thumb = join(WORK, 'thumbs', `${name}_01.jpg`);
  try { imageToThumb(image, thumb); } catch { return null; }
  return {
    id: `a_${String(idx).padStart(3, '0')}`,
    src: image,
    file: basename(image),
    type: 'image',
    start: 0,
    end: 0,
    dur: 2.5,
    frames: [{ t: 0, thumb }],
    thumbs: [thumb],
    width: 1920,
    height: 1080,
    fps: 30,
  };
}

const files = readdirSync(SRC)
  .filter(f => VIDEO_EXT.has(extname(f)) || IMAGE_EXT.has(extname(f)))
  .map(f => join(SRC, f))
  .sort();

const assets = [];
let idx = 0;
const lang = normalizeLang(readRun(WORK).language || readRun(WORK).lang);
writeProgress(WORK, { phase: 'scan', language: lang, totalFiles: files.length, fileIndex: 0, message: `${t(lang, 'msg_scan_start')} · ${files.length}` });

for (let fi = 0; fi < files.length; fi++) {
  const file = files[fi];
  const name = basename(file, extname(file));
  const ext = extname(file);
  writeProgress(WORK, { phase: 'scan', language: lang, currentFile: basename(file), fileIndex: fi + 1, totalFiles: files.length, message: t(lang, 'msg_scan_file') });
  try {
    const asset = IMAGE_EXT.has(ext) ? scanImage(file, name, ++idx) : scanVideo(file, name, ++idx);
    if (asset) assets.push(asset);
  } catch (e) {
    console.error(`[draftcut] 跳过 ${basename(file)}: ${e.message?.slice(0, 100)}`);
  }
}

// shots 兼容旧脚本：每个 asset 一条，整段作为一个单元
const shots = assets.map(a => ({
  id: a.id,
  src: a.src,
  file: a.file,
  type: a.type,
  start: a.start,
  end: a.end,
  dur: a.dur,
  frames: a.frames,
  thumbs: a.thumbs,
  width: a.width,
  height: a.height,
  fps: a.fps,
}));

writeFileSync(join(WORK, 'shots.json'), JSON.stringify({
  sourceDir: SRC,
  scannedAt: new Date().toISOString(),
  maxFramesPerAsset: MAX_FRAMES,
  assetCount: assets.length,
  videoCount: assets.filter(a => a.type === 'video').length,
  imageCount: assets.filter(a => a.type === 'image').length,
  assets,
  shots,
}, null, 2));

writeProgress(WORK, {
  phase: 'scan',
  language: lang,
  fileIndex: files.length,
  totalFiles: files.length,
  shotsTotal: assets.length,
  shotsDone: assets.length,
  message: `${assets.length} ${t(lang, 'clips')} · ${assets.filter(a => a.type === 'video').length} video + ${assets.filter(a => a.type === 'image').length} image`,
});
