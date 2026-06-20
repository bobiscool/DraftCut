#!/usr/bin/env node
// 阶段4 · 绘 DRAW
// montage.json -> 手绘风 storyboard.html（单文件，自包含）
// 用法: node scripts/build-storyboard.mjs <montage.json> <out.html>
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(__dirname, '../templates/storyboard.html');

const [, , dataPath, outPath] = process.argv;
if (!dataPath || !outPath) {
  console.error('用法: node scripts/build-storyboard.mjs <montage.json> <out.html>');
  process.exit(1);
}

const tmpl = await readFile(TEMPLATE, 'utf8');
const data = await readFile(resolve(dataPath), 'utf8');
JSON.parse(data); // 校验

// 把模板里 /*__DATA_START__*/ ... /*__DATA_END__*/ 之间替换成真实数据
const out = tmpl.replace(
  /\/\*__DATA_START__\*\/[\s\S]*?\/\*__DATA_END__\*\//,
  `/*__DATA_START__*/ ${data.trim()} /*__DATA_END__*/`
);

await writeFile(resolve(outPath), out, 'utf8');
console.log(`[draftcut] storyboard 写入 ${outPath}`);
