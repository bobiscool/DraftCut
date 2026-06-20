# DraftCut · 设计构思

> 一个 **agent skill**，不是一个 app。
> 给它一个素材目录和一句目标，它自己**扫描 → 拆 → 析 → 推荐风格 → 串联+配乐 → 让你微调 → 导出工程**。
> 终点不是"放给你看"，而是产出**能直接导入剪映 / PR 的工程**，外加一张**手绘风编排图**给人看。
>
> 它本身**不渲染成片**（不出 mp4）。渲染交给剪映 / PR / 达芬奇。这是和 `aicut` 的根本区别。

---

## 1. 北极星：从"素材堆"到"能导入的剪辑工程"

把它想成一个剪辑助理：你把一堆素材丢给它，它看完、想清楚怎么剪、画给你看、让你拖两下微调，最后给你一个**直接能在剪映/PR 里打开继续做**的工程文件。

- aicut：素材 → **mp4**（真渲染）。
- montage：素材 → **剪映 draft / FCPXML 工程 + 手绘编排图**（决策与编排，不渲染）。

价值：AI 负责最累的「看完所有素材 + 想出编排 + 配乐」，人只在熟悉的剪映/PR 里做最后润色。

---

## 2. 七个阶段

```
 ┌ 0 配置 CONFIG ─ 多模态模型（可选，不配则回退当前 agent 读图，贵）
 │
 ▼
 1 扫描 SCAN ── 遍历目录、ffprobe 元数据、ffmpeg 切镜头+关键帧 → shots.json
 ▼
 2 析   READ ── 多模态模型读 contact sheet，给每镜头打标签+高光分 → analysis.json
 ▼
 3 风格 STYLE ─ 基于素材内容推荐 2-3 个风格方向，用户选一个 → style.json
 ▼
 4 串   SEQ ─── agent 当导演：选片/排序/角色/转场/节奏 + 音乐推荐 → montage.json
 ▼
 5 绘   DRAW ── montage.json → 手绘风可交互 storyboard.html
 ▼
 6 微调 TWEAK ─ 用户在 storyboard 的轨道上拖/排/裁 → 回写 montage.json
 ▼
 7 导出 EXPORT ─ montage.json → 剪映 draft_content.json / FCPXML → 落到目录
```

### 2.0 配置 CONFIG —— 多模态模型（能力点 1）
- 读 `draftcut.config.json`（见 `draftcut.config.example.json`）。
- 配了：用户自己的多模态端点（OpenAI 兼容，如 GLM-5.2 走 CC Switch / Qwen-VL），**便宜可控**。
- 没配：**回退**到当前 agent 自身的多模态能力直接读关键帧——能跑，但**贵**（素材多时 token 爆炸），启动时要警告用户。
- 配置项：provider / baseUrl / model / apiKeyEnv，以及导出目标、音乐库路径。

### 2.1 扫描 SCAN —— 遍历素材目录（能力点 2）
- 递归扫描目录，识别视频/图片/音频。
- `ffprobe` 拿元数据；`ffmpeg` 场景检测切镜头、抽关键帧、采音频能量。
- 产物 `shots.json`：镜头原子单位（源、起止、缩略图、音量曲线、类型）。

### 2.2 析 READ —— 给镜头打标签
- 关键帧拼 contact sheet，喂多模态模型一次读完，省 token。
- 每镜头：`summary / subjects / scene / motion / mood / quality / highlight / tags`。
- 产物 `analysis.json`。

### 2.3 风格 STYLE —— 模板库匹配 + 风格推荐（能力点 3）
- **模板库（提示词库）驱动**：`library/` 下是一组"某种片子怎么剪"的模板，每个 = 导演提示词 + 机器约束（节奏/结构/转场/配乐）。详见下方「模板库」一节。
- 模型拿 `analysis.json` 的镜头标签去匹配模板的 `whenToUse`，**推荐最契合的 2-3 个模板**，说明理由；也允许"自由风格"（不套模板）。
- 用户选一个（或 agent 默认推荐 + 可改）→ `style.json`：含选中模板的约束 + 完整提示词，作为「串」阶段的硬约束。

### 2.4 串 SEQ —— 出剪辑 + 音乐推荐（能力点 4）
- 在选定风格约束下当导演：选片、排序、分叙事角色、定 trim/转场/节奏。
- **音乐与卡点**：
  - **用户自带音乐**：丢一首歌进来 → `detect-beats` 检测 BPM/beats → `snap-to-beats` 把每个剪辑点**吸附到拍子**（`--every N` 控制每几拍一刀）。storyboard 预览会放这首歌、视频静音、节拍条实时打点。
  - **仅推荐**：没给音乐时扫本地库按风格/BPM 推荐候选（不下载版权内容），仅标注不播放。
- 每镜头写 `rationale` 导演笔记。
- 产物 `montage.json`（核心契约，含 `sequence` + `music` + `tempoCurve` + **`tracks`**）。
- `tracks` = 多条叙事/编排轨：**本线**(video,可播放) / **主线·支线·支线2**(note 叙事线) / **Bgm**(audio+节拍) / **情感线**(arc 情绪曲线)。**不渲染**。

### 2.5 绘 DRAW —— 手绘 **SVG 多轨时间线**（含情感线）
- `montage.json` → 单文件 `storyboard.html`：用 **SVG** 画一条**真正的多轨剪辑时间线**（像 NLE，但手绘质感：feTurbulence 抖动 + 手写体 + 纸纹）。
- 轨道从上到下：**本线 / 主线 / 支线 / Bgm / 支线2 / 情感线**，共用同一时间轴；情感线是贯穿全程的手绘情绪曲线（低谷标「孤独」、高峰标「感动」）。
- 顶部保留**可播放预览器 + 听音乐/节拍条**；竖直**播放头**随播放贯穿所有轨。

### 2.6 微调 TWEAK —— 在 SVG 时间线上直接拖（能力点 5）
- storyboard.html 的 SVG 轨道**可操作**：
  - **拖动片段**改时间位置；
  - **拖右缘手柄裁剪**时长；
  - 点「本线」片段**试播**那一段。
- 点「⬇ 导出 montage.json」把拖动后的结果**回写**下载成新的 `montage.json`（本线按 start 重排回 sequence，其它轨/情感线一并回写）。
- 原则：**人改过的 montage.json 才是最终导出源**，避免"AI 出的不能改"。

### 2.7 导出 EXPORT —— 落工程到目录（能力点 6）
- `montage.json` → 两种工程，写到 `export/`：
  - **FCPXML**（`.fcpxml`）：PR / 达芬奇 / FCP 可导入。最标准、最通用。
  - **剪映 draft**（`draft_content.json` + `draft_meta_info.json`）：可放进剪映草稿目录直接打开。⚠️ 剪映格式随版本变化，需对齐目标版本，必要时借助 `pyJianYingDraft` 之类已知 schema。
- 导出只引用**原始素材路径**（不复制大文件），保证用户在剪映/PR 里看到的是原片。

---

## 2.8 模板库（提示词库）—— 可扩展的"怎么剪"知识

`library/` 是这个 skill 的"剪辑经验库"。每个模板是一个 `.md`：

- **frontmatter（机器约束）**：`id / name / aka / whenToUse / aspect / duration / pacing / avgShot / structure / transitions / musicMood / bpm / captions`。
- **正文（导演提示词）**：自然语言告诉模型这种片子怎么选片、怎么排序、怎么卡点、怎么转场——这就是"提示词库"的部分。

内置起始模板：`food-vlog`（烟火气美食）、`beat-sync`（卡点踩拍）、`emotional-slow`（情绪慢剪）、`travel-montage`（旅行大片）、`talking-head`（口播/教程）。

读取：`scripts/library.mjs`
- `list` 人看的清单；`json` 给 agent 匹配用的全量元数据；`show <id>` 取某模板完整提示词。

**可扩展**：用户把自己的 `.md` 丢进 `library.userDirs`（默认 `~/.draftcut/library`）就能新增/覆盖风格，不改代码。模板既约束阶段3（推荐），又喂养阶段4（串联时当导演指令）。

---

## 3. 数据契约

```
work/
  shots.json        # 1 扫描
  analysis.json     # 2 析
  style.json        # 3 风格（用户选定）
  montage.json      # 4/6 串+微调（中心契约）
  thumbs/ contact_sheets/
storyboard.html     # 5 手绘可交互图（也是微调界面）
export/
  <name>.fcpxml     # 7 PR/达芬奇
  jianying/<name>/draft_content.json + draft_meta_info.json  # 7 剪映
Storyline.md        # 可选，文字版编排，便于 git diff
library/*.md          # 模板库（提示词库），可被 userDirs 扩展
draftcut.config.json # 0 配置
```

`montage.json` 是中心契约：AI 产出它、用户微调它、导出器消费它。三方都围着它转。

---

## 4. 这是一个 skill，怎么用

放进 `~/.claude/skills/montage/` 或项目的 `.claude/skills/`。
触发："把这个文件夹素材扫一下，推荐个风格，串个 30 秒的片，配上音乐，出编排图，最后导出剪映工程。"
agent 读 `SKILL.md` 按七阶段执行。

---

## 5. 边界 / 不做什么

- ❌ 不渲染成片（不出 mp4）——渲染交给剪映/PR/达芬奇。
- ❌ 不下载/分发版权音乐——只做匹配与候选推荐。
- ❌ 不绑死模型厂商——多模态/文本都走可替换 provider。
- ✅ 只负责：扫素材、想编排、配乐、画出来、让人微调、导出成能继续做的工程。

---

## 6. 待定决策（需要你拍板）

1. 仓库名 `montage` 是否 OK？（备选 `storyweave` / `cutmind` / `分镜`）
2. 多模态默认端点：直接默认你现在的 `glm-5.2`（CC Switch `http://127.0.0.1:15721/v1`）吗？
3. 导出优先级：**剪映优先**还是 **FCPXML(PR/达芬奇)优先**？（剪映格式更脆，需锁版本——你用的剪映版本号是多少？）
4. 微调轨道：HTML 内置纯前端拖拽（零依赖、够用）够吗，还是要更专业的轨道交互？
5. 音乐：只扫本地库，还是也要在线候选（给名字/风格，不下载）？
