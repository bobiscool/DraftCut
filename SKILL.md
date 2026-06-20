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

## 阶段 0 · 配置 CONFIG（多模态模型）

1. 找 `draftcut.config.json`（参考 `draftcut.config.example.json`）。
2. **配了** `multimodal.enabled=true`：用用户的多模态端点（OpenAI 兼容，如 GLM-5.2 / Qwen-VL）读图——便宜可控。
3. **没配**：回退用**当前 agent 自身**直接读关键帧。**必须警告用户**：素材多时 token 很贵，建议配端点。
4. 读出导出目标（fcpxml / jianying）、音乐库路径备用。

## 阶段 1 · 扫描 SCAN（遍历目录）

1. 递归扫描素材目录，分类视频/图片/音频。
2. 每个视频跑 `scripts/detect-shots.sh <video> <work>`：ffprobe 元数据 + ffmpeg 场景检测切镜头 + 抽关键帧 + 音频能量。
3. 汇总 `work/shots.json`：`{id, src, type, start, end, dur, thumbs[], resolution, fps, audioEnergy[]}`。镜头粒度要细（0.5–6s）。

## 阶段 2 · 析 READ（打标签）

1. `scripts/contact-sheet.sh <work>` 拼关键帧。
2. 把 contact sheet + 每格 shot id 喂阶段0 的多模态模型，一次读完。
3. 每镜头写 `work/analysis.json`：`{id, summary, subjects[], scene, motion, mood, quality(0-1), highlight(0-1), tags[]}`。
4. 低质/低高光镜头标记候选废弃。

## 阶段 3 · 风格 STYLE（模板库匹配 + 风格推荐）

1. **读模板库**：`node scripts/library.mjs json`（含 config 里 `library.userDirs` 的自定义模板）。模板库 = 一组"某种片子怎么剪"的导演提示词 + 机器可读约束（节奏/结构/转场/配乐）。
2. **匹配**：拿 `analysis.json` 的镜头标签去对每个模板的 `whenToUse`/标签打分，**推荐最契合的 2-3 个模板**，说明为什么（基于素材里有什么）。也允许"自由风格"（不套模板，模型自拟）。
3. 把候选给用户选；用户没指定就选最契合的并说明理由。
4. 选定后 `node scripts/library.mjs show <id>` 取该模板**完整提示词**，连同其约束写进 `work/style.json`，作为「串」阶段的硬约束 + 喂给模型的导演指令。
5. 模板库可扩展：用户把自己的 `.md` 放进 `library.userDirs` 即可新增风格。

## 阶段 4 · 串 SEQ（出剪辑 + 音乐推荐，核心）

**靠你推理，不是写死算法。** 在 `style.json` 约束下：
1. **选片**：按 highlight/quality 过滤。
2. **结构**：分配 `hook → intro → build → climax → outro`，开头 3 秒抓人。
3. **排序 & trim**：定入出点、时长，总时长贴近风格建议。
4. **转场 & 节奏**：选 `cut/dissolve/whip/match-cut…`，标节奏意图。
5. **音乐（两种来源）**：
   - **用户自带音乐（推荐）**：用户把音乐丢进来 → `node scripts/detect-beats.mjs <audio> work/beats.json` 检测 BPM 与 beats → `node scripts/snap-to-beats.mjs work/montage.json work/beats.json --every N` 把剪辑点**吸附到拍子上卡点**（慢风格 `--every` 调大）。`music.src` 写进 montage.json，storyboard 预览会放这首歌并视觉打拍。
   - **仅推荐**：用户没给音乐时，扫 `music.libraryDir` 本地库按风格/BPM 推荐候选（**不下载版权内容**），只在视频上方标注，不播放。
6. 每镜头写 `rationale` 导演笔记。
7. **产出叙事轨 `tracks`**：除本线(=sequence)外，再生成 **主线/支线/支线2**(note) 叙事线、**Bgm**(audio) 与 **情感线**(arc，情绪 0–1 随时间起伏)。
8. 产出 `work/montage.json`（结构见 `examples/montage.json`，含 `sequence + music + tempoCurve + tracks`）。**不渲染。**

## 阶段 5 · 绘 DRAW（手绘 + 可播放预览）

1. `node scripts/build-storyboard.mjs <work>/montage.json <out>/storyboard.html`。
2. **SVG 手绘多轨时间线**：像 NLE 的轨道但手绘质感（feTurbulence 抖动 + 手写体 + 纸纹）。轨道从上到下：本线/主线/支线/Bgm/支线2/情感线，共用同一时间轴。
3. **可播放**：顶部预览播放器 `▶ 播放全片`按 in/out 顺序播原片；点「本线」片段单独预览；竖直播放头贯穿所有轨同步走。
4. **音乐**：有 `music.src` 则播放并按拍同步、节拍条打点；否则只在上方横幅标注推荐、不播放。
5. 每段需带 `src` 才能播放；缺失回退占位。打开给用户看并讲一遍编排逻辑。

## 阶段 6 · 微调 TWEAK（用户简单轨道编排）

1. `storyboard.html` 的 SVG 轨道可**拖动片段改位置、拖右缘裁剪时长、点本线片段试播**。
2. 用户改完点「⬇ 导出 montage.json」下载回写版，覆盖 `work/montage.json`。
3. **以人改过的版本为最终导出源**。若用户口头让你改，也直接改 `montage.json` 重生成 storyboard。

## 阶段 7 · 导出 EXPORT（落工程到目录）

1. **FCPXML**（PR/达芬奇/FCP）：`node scripts/export-fcpxml.mjs <work>/montage.json export/<name>.fcpxml`。
2. **剪映 draft**：`node scripts/export-jianying.mjs <work>/montage.json export/jianying/<name>`。⚠️ 剪映格式随版本变化，导出后确认能在目标版本打开；必要时对齐已知 schema。
3. 工程只引用**原始素材路径**，不复制大文件。
4. 告诉用户产物位置 + 如何导入（剪映：放进草稿目录；PR：File→Import 选 .fcpxml）。

---

## 产物清单

```
draftcut.config.json     # 0 配置
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

- 镜头粒度要细，宁可多切。
- 每个串联决策可解释（写进 rationale）。
- 不出 mp4——渲染交给剪映/PR；montage 只负责"怎么剪 + 能继续做的工程"。
- 不下载版权音乐，只匹配/推荐。
- 模型与导出器都可替换，脚本不绑厂商。
- 没配多模态端点就回退 agent 读图，但**先警告贵**。
