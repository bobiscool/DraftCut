---
name: draftcut
description: DraftCut · AI 剪辑助理 skill。扫描素材目录、用多模态模型分析镜头、推荐风格、自动串联成片思路并推荐配乐、产出可微调的手绘风编排图，最后导出剪映 draft / FCPXML 工程供用户在剪映或 PR 里继续做。本身不渲染成片。Use when the user wants to analyze a folder of footage, get a cut/sequence + music suggestion, tweak it, and export an editable project for CapCut(剪映)/Premiere.
---

# montage skill

你是一个剪辑助理。给你一个素材目录和一句目标（brief），你要：
**配置模型 → 扫描 → 分析 → 推荐风格 → 串联+配乐 → 出可微调编排图 → 导出剪映/PR 工程。**

你**不渲染成片**（不出 mp4）。最终交付：`storyboard.html`（人看+微调）、`work/montage.json`（中心契约）、`export/` 下的剪映 draft 与 FCPXML 工程。

依赖：`ffmpeg`、`ffprobe`、`node`。多模态/文本模型可替换。

按七阶段顺序执行，每阶段落地中间产物，便于复查与续跑。

---

## 阶段 0 · 配置 CONFIG（多模态模型 + 进度 + 告知用户）

1. **首次使用**（agent 必须提醒用户完成，缺任一项则停步说明）：
   ```bash
   cp draftcut.config.example.json draftcut.config.json   # 改 baseUrl / model / apiKeyEnv
   cp .env.example .env                                 # 填 API Key（与 apiKeyEnv 同名）
   ```
   脚本会自动加载 skill 目录下的 `.env`（不覆盖 shell 已 export 的变量）。
2. **密钥与隐私（skill 硬规矩）**：
   - **API key 只写在 `.env`**（或用户自己 export）；config 里只有 `apiKeyEnv` 变量名，**禁止**写真实 key、**禁止**提交 `.env`。
   - **禁止**去读用户其它项目里的 `.env`——只认 skill 目录的 `.env` 或当前 shell 环境变量。
   - **禁止**把某次试跑的素材路径当默认；每次以用户给的目录为准。
   - 缺 `.env` / 缺 key：告诉用户 `cp .env.example .env` 并填哪个变量，**不要替用户猜 key**。
3. **解析后端**：跑 `node scripts/resolve-vision.mjs <work>`。它按优先级选定 provider、写 `work/run.json`、打印给用户看的告知文案。三种后端：
   - **`user-endpoint`**（推荐）：`multimodal.enabled=true`，走用户自配的多模态端点（OpenAI 兼容，如 GLM-5.2 / Qwen-VL）。便宜、可控、可离线网关。
   - **`apple-on-device`**：`vision.provider=apple-on-device` 或 `preferOnDevice=true`，走 macOS **Vision 框架**（本地、免费、隐私好）。基础标签强，语义弱于 VLM，可作粗筛或离线兜底。
   - **`agent`**：未配端点且未开 Apple 时回退**当前 agent 自身**读帧。能跑但素材多时 **token 很贵**——脚本会以**退出码 10** 提示需确认，**必须先征得用户同意**再继续。
4. 优先级（脚本内置）：`user-endpoint` > `apple-on-device`（macOS 且 `preferOnDevice`）> `agent`（需确认）。**读帧前必须把 provider 告知用户**——直接转述脚本输出即可。
5. **进度**：长阶段用 `scripts/lib/progress.mjs` 的 `writeProgress(work, patch)` 维护 `work/progress.json`（见下方「进度协议」），并在对话里按阶段播报；扫描/读帧不能 silent 跑完。
6. 读出导出目标（fcpxml / jianying）、音乐库路径备用。
7. **目标时长（必问）**：开始前向用户确认成片目标时长（如 30s / 60s / 3min），或根据 brief 给出建议并请用户确认。**禁止无 brief、无目标时长就瞎解析编排**。写入 `work/run.json` 的 `targetDuration`（秒）和 `brief`。
8. **推荐一键启动**：`node scripts/run.mjs <素材目录> [work] --brief "…" --duration 60 --lang zh|en|ja --open` —— 语言写入 `run.json`，UI 可切换；**AI 分析/总结与当前语言一致**（read-shots prompt 按 language 输出中文/英文/日文）。

## 阶段 1 · 扫描 SCAN（遍历目录：视频 + 图片）

1. `node scripts/scan-folder.mjs <素材目录> <work>`：**遍历目录下所有视频与图片**（mp4/mov/heic/jpg…），**每个文件 = 一个素材单元(asset)**，在整段时长上**均匀采样最多 20 帧**（不碎切镜头），用于后续理解整段情节。
2. 单文件失败（如 YUV 异常）跳过并继续，stderr 告警，**不得 silent 漏文件**。
3. 进度：每处理一个文件更新 `progress.json`（`phase=scan`、`currentFile`、`fileIndex/totalFiles`）。
4. `work/shots.json`：`{ sourceDir, assets[], shots[] }`。每个 asset：`{id, src, file, type:video|image, start, end, dur, frames:[{t,thumb}], thumbs[], width, height, fps}`。图片默认 `dur=2.5s` 供编排参考。

## 阶段 1.5 · 转写 TRANSCRIBE（音频→文字，讲解类必做）

1. `node scripts/transcribe.mjs <work>`：对有音轨的源视频提取音频跑 whisper，产出带时间戳的 `work/transcripts.json`。
2. 后端自动探测：`mlx_whisper`(Apple) > `openai-whisper` > `faster-whisper` > `whisper.cpp`；都没装会提示安装方式。
3. **讲解/教程/访谈/vlog 类素材强烈建议开**——否则只能凭画面猜"在讲什么"，理解隔一层。纯空镜/风景可跳过。
4. 转写结果会在阶段2 喂给多模态模型（整段全文 + 每镜头对应语音），并写进 `analysis.json` 每镜头的 `transcript`。
5. ⚠️ whisper 在**无人声/纯背景音**片段上会编造像样的句子（幻觉）。脚本已折叠重复、过滤过短/纯标点，但短噪声仍可能漏网——别全信空镜上的转写。要更稳可加 VAD（如 Silero）先做人声检测再转写。

## 阶段 2 · 析 READ（整段理解，每文件 ≤20 帧）

1. **开始前**向用户说明：`本次读帧后端 = user-endpoint | apple-on-device | agent`，并估算素材数 / 大致耗时。
2. `node scripts/read-shots.mjs <work>`：按 **asset（一文件一单元）** 拼 contact sheet（≤20 格）→ 多模态模型理解**整段情节**，不是逐碎镜头打标签。
3. 按 `work/run.json` 的 provider 解析（user-endpoint / apple-on-device / agent），批间更新 `progress.json`。
4. **输出重点**（每个源文件一条）：
   - `videoSummary`：2–4 句整段在干嘛
   - `title`：**中文短标题**（8 字内，禁止 hook/intro 等英文占位）
   - `narrativeBeats`：按时间 3–8 条关键事件
   - `bestMoments`：`[{frame, t, reason, highlight}]` 高光时刻
5. 写 `work/analysis.json`：`{assets:[{id,file,type,title,summary,narrativeBeats,bestMoments,...}], shots:[同结构+thumbs/frames]}`（`videos` 为兼容别名）。
6. 低质/无关素材可在编排阶段弃用，但扫描阶段必须**全量覆盖**。

## 阶段 3 · 风格 STYLE（模板库匹配 + 风格推荐）

1. **读模板库**：`node scripts/library.mjs json`（含 config 里 `library.userDirs` 的自定义模板）。模板库 = 一组"某种片子怎么剪"的导演提示词 + 机器可读约束（节奏/结构/转场/配乐）。
2. **匹配**：拿 `analysis.json` 的镜头标签去对每个模板的 `whenToUse`/标签打分，**推荐最契合的 2-3 个模板**，说明为什么（基于素材里有什么）。也允许"自由风格"（不套模板，模型自拟）。
3. 把候选给用户选；用户没指定就选最契合的并说明理由。
4. 选定后 `node scripts/library.mjs show <id>` 取该模板**完整提示词**，连同其约束写进 `work/style.json`，作为「串」阶段的硬约束 + 喂给模型的导演指令。
5. 模板库可扩展：用户把自己的 `.md` 放进 `library.userDirs` 即可新增风格。

## 阶段 4 · 串 SEQ（出剪辑 + 音乐推荐，核心）

**靠你推理，不是写死算法。严禁只按 highlight 分数排序了事。** 在 `style.json` 约束 + `run.json.targetDuration` 下：
0. **先读懂整段**：综合 `analysis.json` 的 `assets[].summary/narrativeBeats/title` 想清楚「这堆素材整体在讲什么」，定成片叙事意图。**总时长必须贴近 `targetDuration`**（用户未给则先问）。
1. **选片**：按叙事功能 + highlight 选；可从 `bestMoments` 取 in/out，或整段/截段使用。
2. **结构**：内部可用 hook/intro/build/climax/outro 规划节奏，但 **`sequence[].label` 必须是中文内容标题**（如「生蚝下锅」），**禁止**把 hook/intro 当用户可见标题。
3. **排序 & trim**：定入出点、时长，总时长贴近 `targetDuration`。
4. **转场 & 节奏**：选 `cut/dissolve/whip/match-cut…`，标节奏意图。
5. **音乐（两种来源）**：
   - **用户自带音乐**：`detect-beats.mjs` + `snap-to-beats.mjs` 卡点。
   - **仅推荐**：扫本地库推荐，不下载版权内容。
6. 每段写 `rationale`；`sequence[]` 带 `thumb` + `thumbs[]`（analysis 的 frames，供 filmstrip）。
7. **产出叙事轨 `tracks`**：除本线外，根据 narrativeBeats 生成 **主线/支线/支线2**(note，**中文 label**)、**Bgm**、**情感线**(arc)。
8. 产出 `work/montage.json`（见 `examples/montage.json`）。**不渲染。**

## 阶段 5 · 绘 DRAW（手绘 + 可播放预览）

1. **推荐起本地服务**：
   - **一开始就跑**：`node scripts/run.mjs <dir> --open` 或 `node scripts/serve.mjs <work> --open` —— 页面**从第一秒起**展示实时状态（扫描/转写/分析/编排），轮询 `work/progress.json`（`/api/progress`），agent 写 progress 即更新 UI。
   - montage 就绪后**热加载**编排视图（不整页 refresh），避免闪屏。
2. **SVG 时间线**：本线 filmstrip 缩略图条；**可缩放（±/滑条/Ctrl+滚轮）+ 横滚**，轨道多时可拉宽查看。
3. **播放**：双缓冲 `<video>` 切换片段，减少黑屏闪动；连播时不 scrollIntoView 整页。

## 阶段 6 · 微调 TWEAK（用户简单轨道编排）

1. SVG 轨道可**拖动片段改位置、拖右缘裁剪时长、点本线片段/镜头卡试播**。
2. **服务模式（推荐）**：点「💾 保存修改」直接 `POST /api/montage` 回写 `work/montage.json`；点「🎬 导出 FCPXML / ✂️ 导出 剪映」一键生成工程到 `work/export/`（先自动保存再导出）。无需下载-覆盖。
3. 静态模式：点「⬇ 导出 montage.json」下载，再手动覆盖 `work/montage.json`。
4. **以人改过的版本为最终导出源**。用户口头让你改，也直接改 `montage.json`（服务会在下次请求时重读）。

## 阶段 7 · 导出 EXPORT（落工程到目录）

1. **FCPXML**（PR/达芬奇/FCP）：`node scripts/export-fcpxml.mjs <work>/montage.json export/<name>.fcpxml`。
2. **剪映 draft**：`node scripts/export-jianying.mjs <work>/montage.json export/jianying/<name>`。⚠️ 剪映格式随版本变化，导出后确认能在目标版本打开；必要时对齐已知 schema。
3. 工程只引用**原始素材路径**，不复制大文件。
4. 告诉用户产物位置 + 如何导入（剪映：放进草稿目录；PR：File→Import 选 .fcpxml）。

---

## 进度协议 · work/progress.json

agent 与脚本共用，便于续跑和 UI 展示：

```json
{
  "phase": "scan|transcribe|read|style|seq|draw|export",
  "phaseLabel": "扫描素材",
  "visionProvider": "user-endpoint|apple-on-device|agent",
  "visionLabel": "GLM-5.2 @ 127.0.0.1:15721",
  "currentFile": "DJI_0005.MP4",
  "fileIndex": 3,
  "totalFiles": 6,
  "batchIndex": 2,
  "totalBatches": 8,
  "shotsDone": 45,
  "shotsTotal": 120,
  "startedAt": "ISO8601",
  "updatedAt": "ISO8601",
  "message": "scene detect 565s 视频，约还需 8 分钟"
}
```

长阶段（scan / transcribe / read / seq）**禁止 silent**：每完成一个文件或一批必须更新此文件；**serve 模式网页会轮询展示**。编排时 agent 写 `phase=seq, message=生成编排中…`。

## 产物清单

```
draftcut.config.example.json  # 0 配置模板（进仓库）
.env.example                  # 0 密钥模板（进仓库）
draftcut.config.json          # 0 用户本地配置（gitignore）
.env                          # 0 用户本地密钥（gitignore）
work/run.json           # 0 本次运行：vision provider、brief、config 快照
work/progress.json      # 全程进度
work/shots.json         # 1 扫描
work/analysis.json      # 2 析
work/style.json         # 3 风格
work/montage.json       # 4/6 串+微调（中心契约）
work/thumbs/ contact_sheets/
storyboard.html         # 5 手绘可交互（含微调）
export/<name>.fcpxml            # 7 PR/达芬奇
export/jianying/<name>/...      # 7 剪映
Storyline.md            # 可选
```

## 原则

- **全量扫描**：目录内视频+图片都要进 `shots.json`，每文件最多 20 帧描述整段，不要碎切到上百镜头。
- 每个串联决策可解释（写进 rationale）。
- 不出 mp4——渲染交给剪映/PR；montage 只负责"怎么剪 + 能继续做的工程"。
- 不下载版权音乐，只匹配/推荐。
- 模型与导出器都可替换，脚本不绑厂商。
- **skill 不绑用户私货**：不写死 key、不读其它项目 `.env`、不提交 `draftcut.config.json`；缺配置就停步说明。
- 读帧前**必须告知** provider（自配端点 / Apple 本地 / 当前 agent），agent 回退需用户知情。
- 长素材扫描与读帧**必须有进度**（`progress.json` + 对话播报）。
