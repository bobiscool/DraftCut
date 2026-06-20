#!/usr/bin/env node
// 阶段7 · 导出 EXPORT → FCPXML（PR / 达芬奇 / FCP 可导入）
// 用法: node scripts/export-fcpxml.mjs <montage.json> <out.fcpxml> [shots.json]
// 说明: 从 montage.json 取顺序/trim；若提供 shots.json 则用其解析每个镜头的源文件与源入点。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';

const [, , dataPath, outPath, shotsPath] = process.argv;
if (!dataPath || !outPath) {
  console.error('用法: node scripts/export-fcpxml.mjs <montage.json> <out.fcpxml> [shots.json]');
  process.exit(1);
}

const FPS = 30;                       // 默认时基，可按素材改
const TB = `1/${FPS}s`;               // frameDuration
const f = s => `${Math.round(s * FPS)}/${FPS}s`;   // 秒 → rational 时间
const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));

const montage = JSON.parse(await readFile(resolve(dataPath), 'utf8'));
let shots = {};
if (shotsPath) {
  try {
    const arr = JSON.parse(await readFile(resolve(shotsPath), 'utf8'));
    for (const sh of (arr.shots || arr)) shots[sh.id] = sh;
  } catch { /* 可选 */ }
}

const seq = (montage.sequence || []).filter(s => s.enabled !== false);

// 收集素材资源（去重）
const assets = new Map();
for (const s of seq) {
  const sh = shots[s.shotId] || {};
  const src = s.src || sh.src || `MISSING/${s.shotId || 'clip'}.mov`;
  if (!assets.has(src)) {
    assets.set(src, {
      id: `r${assets.size + 2}`,
      src,
      name: basename(src),
      duration: sh.dur ? f(sh.dur + 60) : f(3600), // 资源总时长占位
    });
  }
}

let totalDur = 0;
const clips = seq.map(s => {
  const sh = shots[s.shotId] || {};
  const src = s.src || sh.src || `MISSING/${s.shotId || 'clip'}.mov`;
  const a = assets.get(src);
  const srcStart = (sh.start || 0) + (s.in || 0);
  const dur = s.dur || ((s.out || 0) - (s.in || 0)) || 2;
  const offset = totalDur; totalDur += dur;
  return `        <asset-clip name="${esc(a.name)}" ref="${a.id}" offset="${f(offset)}" start="${f(srcStart)}" duration="${f(dur)}" format="r1">
          <note>${esc(`#${s.order} ${s.role || ''} · ${s.rationale || ''}`)}</note>
        </asset-clip>`;
}).join('\n');

const assetDefs = [...assets.values()].map(a =>
  `    <asset id="${a.id}" name="${esc(a.name)}" src="file://${esc(resolve(a.src))}" duration="${a.duration}" hasVideo="1" hasAudio="1" format="r1"/>`
).join('\n');

const fcpxml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" name="FFVideoFormat1080p${FPS}" frameDuration="${TB}" width="1920" height="1080"/>
${assetDefs}
  </resources>
  <library>
    <event name="montage">
      <project name="${esc(montage.brief || 'montage')}">
        <sequence format="r1" duration="${f(totalDur)}" tcStart="0s" tcFormat="NDF">
          <spine>
${clips}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;

await mkdir(dirname(resolve(outPath)), { recursive: true });
await writeFile(resolve(outPath), fcpxml, 'utf8');
console.log(`[draftcut] FCPXML 写入 ${outPath} （${seq.length} 段, 总时长 ${totalDur.toFixed(1)}s）`);
if ([...assets.values()].some(a => a.src.startsWith('MISSING'))) {
  console.warn('[draftcut] ⚠️ 有镜头缺源文件路径：导出时请带上 shots.json，或在 montage.json 的段里补 "src" 字段。');
}
