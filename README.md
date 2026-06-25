# DraftCut

An **AI skill** for turning a folder of footage into an editable cut plan—plus the scripts and web storyboard the skill runs.

**[English](#english)** · **[中文](#中文)**

---

## English

**DraftCut is an AI skill, not a standalone app.** The skill lives in `SKILL.md`: it teaches an AI agent how to be your editing assistant—scan a folder, understand clips, pick a style, build a sequence, open a storyboard for tweaks, export to CapCut or FCPXML. **`scripts/`** and the web UI are tools the skill calls. You *can* run them by hand; the intended flow is: **tell the AI your folder + brief, let the skill run the pipeline.**

Works in **Cursor** and any agent that loads skills (same idea as other AI coding / assistant skills).

Does **not** render a final MP4—delivers a plan you finish in Premiere, Final Cut, Resolve, or CapCut.

![DraftCut after the skill pipeline: scan → AI analysis → multi-track timeline → export](docs/screenshots/storyboard-tokyo-timeline-en.png)

### What it's for

- **Raw footage, no edit yet** — travel, vlog, food, product; the AI reads content and proposes a cut
- **Speech + visuals** — transcription + vision so the AI knows what is said and shown
- **Finish in a real NLE** — `montage.json`, storyboard, FCPXML / CapCut draft

### What you get

| Piece | Role |
|-------|------|
| `SKILL.md` | **The AI skill** — stages, rules, when to ask you |
| `work/shots.json` | Scan (up to 20 frames per asset) |
| `work/analysis.json` | AI titles, summaries, beats, highlights |
| `work/montage.json` | Edit plan (source of truth) |
| Web storyboard | Preview, drag, trim, save, export |

Pipeline: `Scan → Transcribe → Analyze → Sequence → Done`

### Install

1. Clone this repo.
2. **Load the skill** for your AI agent — e.g. in Cursor: add `SKILL.md` as a project skill, or copy/link it into your agent’s skills folder.
3. Config once:

```bash
cp .env.example .env
cp draftcut.config.example.json draftcut.config.json
# Multimodal API key in .env (e.g. QWEN_API_KEY)
```

Also needs: `node`, `ffmpeg` / `ffprobe`, a multimodal API endpoint.

### How to use

**With AI (recommended)**

> Use the DraftCut skill on `/path/to/footage` — brief: “Tokyo travel vlog, 60s”, target duration 60.

The AI reads `SKILL.md`, confirms brief/duration and vision backend, runs scan → transcribe → analyze, writes `montage.json`, opens storyboard, exports on request.

**Scripts only (no skill session)**

```bash
node scripts/run.mjs "/path/to/media" --brief "Tokyo travel vlog" --duration 60 --lang en --open
node scripts/serve.mjs work --port 8793 --open
```

Keep API keys in `.env` only—never commit them. `.env` and `draftcut.config.json` are gitignored; use `.env.example` and `draftcut.config.example.json` as templates.

---

## 中文

**DraftCut 是一个 AI Skill，不是单独的应用。** Skill 定义在 `SKILL.md` 里：教 AI agent 如何当你的剪辑助理——扫目录、理解素材、选风格、串片子、开 storyboard 微调、导出剪映 / FCPXML。**`scripts/`** 和网页是 skill 调用的工具；也可以手跑，但推荐用法是：**告诉 AI 素材路径 + brief，让 skill 跑完整流程**。

适用于 **Cursor** 及一切能加载 skill 的 AI agent（和别的 AI skill 是同一套概念）。

**不渲染成片**，只产出可导入 PR / 达芬奇 / 剪映的剪辑计划。

![DraftCut skill 跑通后：扫描 → AI 理解 → 多轨编排 → 导出](docs/screenshots/storyboard-tokyo-timeline-en.png)

### 用来干嘛

- **素材多、还没开剪** — 旅行 / vlog / 探店 / 产品；AI 读内容并给剪辑方案
- **口播 + 画面** — 转写 + 多模态，理解「讲什么、拍什么」
- **人在 NLE 里精修** — `montage.json`、storyboard、工程文件

### 产出什么

| 部分 | 作用 |
|------|------|
| `SKILL.md` | **AI Skill 本体** — 阶段、规矩、何时问你 |
| `work/shots.json` | 扫描（每素材最多 20 帧） |
| `work/analysis.json` | AI 标题、摘要、叙事节点、高光 |
| `work/montage.json` | 剪辑计划（中心契约） |
| Web storyboard | 预览、拖拽、裁剪、保存、导出 |

流程：`扫描 → 转写 → 分析 → 编排 → 完成`

### 安装

1. 克隆本仓库。
2. **把 skill 挂到你的 AI agent** — 例如在 Cursor 里把 `SKILL.md` 配成项目 skill，或复制到 agent 的 skills 目录。
3. 首次配置：

```bash
cp .env.example .env
cp draftcut.config.example.json draftcut.config.json
# 在 .env 填多模态 API Key（如 QWEN_API_KEY）
```

另需：`node`、`ffmpeg` / `ffprobe`、多模态 API。

### 怎么用

**交给 AI（推荐）**

> 用 DraftCut skill 处理 `/path/to/footage`，brief：「东京旅行 vlog，60 秒」，目标时长 60。

AI 读 `SKILL.md`，确认 brief/时长和读帧后端，跑扫描 → 转写 → 分析，写 `montage.json`，按需开 storyboard、导出。

**仅脚本（不用 skill 会话）**

```bash
node scripts/run.mjs "/path/to/media" --brief "东京旅行 vlog" --duration 60 --lang zh --open
node scripts/serve.mjs work --port 8793 --open
```

API Key 只放 `.env`，勿提交。`.env` 与 `draftcut.config.json` 已在 `.gitignore`；公开仓库只用 `.env.example` / `draftcut.config.example.json` 作模板。
