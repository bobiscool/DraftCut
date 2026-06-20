#!/usr/bin/env bash
# 阶段1 · 拆 CUT
# 用法: scripts/detect-shots.sh <video> <work_dir> [scene_threshold]
# 输出: 场景切点(stdout) + 关键帧到 <work_dir>/thumbs/
set -euo pipefail

VIDEO="${1:?need video path}"
WORK="${2:?need work dir}"
THRESH="${3:-0.3}"
NAME="$(basename "${VIDEO%.*}")"

mkdir -p "$WORK/thumbs"

echo "[draftcut] probing $VIDEO" >&2
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,r_frame_rate,duration \
  -of default=noprint_wrappers=1 "$VIDEO" >&2

# 场景变化时间点（切镜头依据）
echo "[draftcut] detecting scene cuts (threshold=$THRESH)" >&2
ffmpeg -hide_banner -i "$VIDEO" \
  -filter:v "select='gt(scene,$THRESH)',showinfo" \
  -f null - 2>&1 | grep -oE 'pts_time:[0-9.]+' | cut -d: -f2 || true

# 每 2 秒抽一帧做缩略图（关键帧近似）
echo "[draftcut] extracting thumbnails -> $WORK/thumbs/${NAME}_%03d.jpg" >&2
ffmpeg -hide_banner -loglevel error -i "$VIDEO" \
  -vf "fps=1/2,scale=320:-1" "$WORK/thumbs/${NAME}_%03d.jpg"

echo "[draftcut] done. 现在把切点+缩略图整理进 $WORK/shots.json" >&2
