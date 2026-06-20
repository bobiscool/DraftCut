#!/usr/bin/env bash
# 阶段2 · 析 READ 辅助
# 把 work/thumbs/ 里的关键帧拼成 contact sheet，喂给视觉模型一次读完，省 token。
# 用法: scripts/contact-sheet.sh <work_dir> [cols]
set -euo pipefail

WORK="${1:?need work dir}"
COLS="${2:-5}"
OUT="$WORK/contact_sheets/sheet.jpg"

mkdir -p "$WORK/contact_sheets"

shopt -s nullglob
FRAMES=("$WORK"/thumbs/*.jpg)
if [ ${#FRAMES[@]} -eq 0 ]; then
  echo "[draftcut] no thumbs in $WORK/thumbs/, run detect-shots.sh first" >&2
  exit 1
fi

echo "[draftcut] tiling ${#FRAMES[@]} frames -> $OUT" >&2
# 优先用 ffmpeg tile 滤镜（无需 imagemagick）
ROWS=$(( (${#FRAMES[@]} + COLS - 1) / COLS ))
ffmpeg -hide_banner -loglevel error -pattern_type glob -i "$WORK/thumbs/*.jpg" \
  -vf "scale=320:-1,tile=${COLS}x${ROWS}:padding=6:color=white" \
  -frames:v 1 "$OUT"

echo "[draftcut] contact sheet ready: $OUT" >&2
echo "[draftcut] 把这张图连同每格对应的 shot id 一起交给视觉模型，产出 analysis.json" >&2
