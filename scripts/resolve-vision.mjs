#!/usr/bin/env node
/**
 * 阶段0 · 解析读帧后端（vision provider）并告知用户
 * 落实 SKILL.md「阶段2 读帧前必须明确告知用哪种后端」。
 *
 * 用法:
 *   node scripts/resolve-vision.mjs [work_dir] [--config draftcut.config.json]
 *
 * 行为:
 *   1. 读 config 的 multimodal/vision 段，按优先级解析出实际 provider
 *   2. 写 work/run.json（visionProvider/visionLabel/needsConsent）
 *   3. stdout 打印一段「给用户看的告知文案」+ JSON（--json 时仅输出 JSON）
 *
 * 退出码: provider=agent 且需要确认时退出码为 10，便于调用方拦下来先问用户。
 */
import { readFileSync, existsSync } from 'node:fs';
import { platform } from 'node:os';
import { resolve, join } from 'node:path';
import { writeRun } from './lib/progress.mjs';
import { loadEnv, SKILL_ROOT } from './lib/env.mjs';

loadEnv();
const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');
const cfgIdx = args.indexOf('--config');
const cfgValue = cfgIdx >= 0 ? args[cfgIdx + 1] : null;
const cfgValueIdx = cfgIdx >= 0 ? cfgIdx + 1 : -1;
const positional = args.filter((a, i) => !a.startsWith('--') && i !== cfgValueIdx);
const WORK = resolve(positional[0] || 'work');
const CONFIG_PATH = resolve(cfgValue || findConfig());

function findConfig() {
  const candidates = [
    'draftcut.config.json',
    join(SKILL_ROOT, 'draftcut.config.json'),
    join(SKILL_ROOT, 'draftcut.config.example.json'),
  ];
  return candidates.find(existsSync) || candidates[candidates.length - 1];
}

function readJson(path, fallback = {}) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

const cfg = readJson(CONFIG_PATH);
const mm = cfg.multimodal || {};
const vision = cfg.vision || {};
const isMac = platform() === 'darwin';

function endpointReady() {
  if (mm.enabled !== true) return false;
  if (!mm.baseUrl) return false;
  // 有 apiKeyEnv 时要求该环境变量存在；本地网关常无需 key
  if (mm.apiKeyEnv && !process.env[mm.apiKeyEnv]) {
    return { ready: true, warnNoKey: true };
  }
  return { ready: true };
}

function appleReady() {
  // Vision 框架仅 macOS；这里只判断平台，真正可用性由读帧脚本自检
  return isMac;
}

function resolveProvider() {
  const forced = vision.provider && vision.provider !== 'auto' ? vision.provider : null;
  const order = forced
    ? [forced]
    : (vision.preferOnDevice
        ? ['apple-on-device', 'user-endpoint', 'agent']
        : (vision.autoOrder || ['user-endpoint', 'apple-on-device', 'agent']));

  for (const p of order) {
    if (p === 'user-endpoint') {
      const r = endpointReady();
      if (r && r.ready) return { provider: 'user-endpoint', warnNoKey: !!r.warnNoKey };
    } else if (p === 'apple-on-device') {
      if (appleReady()) return { provider: 'apple-on-device' };
    } else if (p === 'agent') {
      return { provider: 'agent' };
    }
  }
  return { provider: 'agent' };
}

const { provider, warnNoKey } = resolveProvider();

const labels = {
  'user-endpoint': `${mm.model || '自配模型'} @ ${mm.baseUrl || '未知端点'}`,
  'apple-on-device': 'macOS Vision 框架（本地）',
  'agent': '当前 agent 直接读图',
};
const visionLabel = labels[provider];
const needsConsent = provider === 'agent' && (vision.requireConsentForAgent !== false);

const run = writeRun(WORK, {
  visionProvider: provider,
  visionLabel,
  configPath: CONFIG_PATH,
  needsConsent,
  warnNoKey: !!warnNoKey,
});

const result = {
  visionProvider: provider,
  visionLabel,
  needsConsent,
  warnNoKey: !!warnNoKey,
  configPath: CONFIG_PATH,
};

if (jsonOnly) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} else {
  const lines = [];
  lines.push('━━━ DraftCut · 读帧后端 ━━━');
  lines.push(`后端: ${provider}`);
  lines.push(`说明: ${visionLabel}`);
  if (provider === 'user-endpoint') {
    lines.push('成本: 低（走你自配端点） · 隐私: 取决于该端点');
    if (warnNoKey) lines.push(`⚠️ ${mm.apiKeyEnv} 未设置 → cp .env.example .env 并填写，或 export ${mm.apiKeyEnv}=...`);
  } else if (provider === 'apple-on-device') {
    lines.push('成本: 免费本地 · 隐私: 不出本机 · 理解力: 中（基础标签）');
  } else {
    lines.push('成本: 高（消耗对话 token） · 理解力: 强');
    if (needsConsent) lines.push('⚠️ 这是回退方案，素材多时很贵——开始读帧前请先征得用户同意');
    if (!isMac) lines.push('（非 macOS，Apple 本地后端不可用）');
  }
  lines.push(`已写入: ${join(WORK, 'run.json')}`);
  process.stdout.write(lines.join('\n') + '\n');
}

process.exit(needsConsent ? 10 : 0);
