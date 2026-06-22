// 进度协议 helper · 被各阶段脚本与 agent 共用
// progress.json 见 SKILL.md「进度协议」；run.json 记录本次运行的 vision provider 等
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PHASE_LABELS = {
  scan: '扫描素材',
  transcribe: '音频转写',
  read: '分析镜头',
  style: '匹配风格',
  seq: '串联剪辑',
  draw: '生成编排图',
  export: '导出工程',
  ready: '就绪',
};

function readJsonSafe(path, fallback = {}) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

// 增量更新 work/progress.json，并在 stderr 打一行 [draftcut] 日志
export function writeProgress(work, patch = {}) {
  mkdirSync(work, { recursive: true });
  const path = join(work, 'progress.json');
  const prev = existsSync(path) ? readJsonSafe(path) : {};
  const next = {
    ...prev,
    ...patch,
    phaseLabel: patch.phaseLabel || PHASE_LABELS[patch.phase || prev.phase] || prev.phaseLabel || '',
    startedAt: prev.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(next, null, 2));
  logProgress(next);
  return next;
}

export function logProgress(p) {
  const bits = [`[draftcut]`, p.phase || '?'];
  if (p.totalFiles) bits.push(`${p.fileIndex ?? 0}/${p.totalFiles}`);
  if (p.currentFile) bits.push(p.currentFile);
  if (p.totalBatches) bits.push(`batch ${p.batchIndex ?? 0}/${p.totalBatches}`);
  if (p.shotsTotal) bits.push(`shots ${p.shotsDone ?? 0}/${p.shotsTotal}`);
  if (p.message) bits.push(`· ${p.message}`);
  process.stderr.write(bits.join(' ') + '\n');
}

export function writeRun(work, data = {}) {
  mkdirSync(work, { recursive: true });
  const path = join(work, 'run.json');
  const prev = existsSync(path) ? readJsonSafe(path) : {};
  const next = { ...prev, ...data, updatedAt: new Date().toISOString() };
  if (!next.startedAt) next.startedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(next, null, 2));
  return next;
}

export function readRun(work) {
  return readJsonSafe(join(work, 'run.json'), {});
}

export { PHASE_LABELS };
