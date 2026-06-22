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
