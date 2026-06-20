#!/usr/bin/env node
// 模板库（剪辑提示词库）读取器
// 用法:
//   node scripts/library.mjs list                 列出所有模板（表格）
//   node scripts/library.mjs json                 输出全部模板元数据 JSON（供 agent 匹配）
//   node scripts/library.mjs show <id>            打印某模板的完整提示词
//   node scripts/library.mjs list <dir1> <dir2>   额外加载用户自定义模板目录
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = resolve(__dirname, '../library');
const LIST_KEYS = new Set(['aka', 'structure', 'transitions']);

// 极简 frontmatter 解析（key: value，逗号分隔的已知 list 字段）
function parse(md, file) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const meta = { _file: file, _id: basename(file).replace(/\.md$/, '') };
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':'); if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (LIST_KEYS.has(k)) meta[k] = v.split(',').map(s => s.trim()).filter(Boolean);
    else if (/^-?\d+(\.\d+)?$/.test(v)) meta[k] = Number(v);
    else meta[k] = v;
  }
  meta._prompt = m[2].trim();
  return meta;
}

async function loadAll(dirs) {
  const out = [];
  for (const dir of dirs) {
    let files = [];
    try { files = (await readdir(dir)).filter(f => f.endsWith('.md')); } catch { continue; }
    for (const f of files) {
      const md = await readFile(join(dir, f), 'utf8');
      const meta = parse(md, join(dir, f));
      if (meta) out.push(meta);
    }
  }
  return out;
}

const [cmd, ...rest] = process.argv.slice(2);
const extraDirs = (cmd === 'show') ? [] : rest.map(d => resolve(d));
const dirs = [DEFAULT_DIR, ...extraDirs];

if (cmd === 'show') {
  const id = rest[0];
  const all = await loadAll([DEFAULT_DIR]);
  const t = all.find(x => x.id === id || x._id === id);
  if (!t) { console.error(`找不到模板: ${id}`); process.exit(1); }
  console.log(`# ${t.name} (${t.id})\n适用: ${t.whenToUse}\n时长: ${t.durationMin}-${t.durationMax}s · 节奏: ${t.pacing} · 画幅: ${t.aspect}\n配乐: ${t.musicMood} ${t.bpmMin||''}-${t.bpmMax||''} BPM\n\n${t._prompt}`);
} else if (cmd === 'json') {
  const all = await loadAll(dirs);
  console.log(JSON.stringify(all.map(({ _prompt, ...m }) => m), null, 2));
} else { // list（默认）
  const all = await loadAll(dirs);
  console.log(`模板库（${all.length} 个）@ ${dirs.join(', ')}\n`);
  for (const t of all) {
    console.log(`  ${(t.id || t._id).padEnd(16)} ${t.name}`);
    console.log(`  ${''.padEnd(16)} 适用: ${t.whenToUse}`);
    console.log(`  ${''.padEnd(16)} ${t.pacing} · ${t.durationMin}-${t.durationMax}s · 配乐 ${t.musicMood}\n`);
  }
}
