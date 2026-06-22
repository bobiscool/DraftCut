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
