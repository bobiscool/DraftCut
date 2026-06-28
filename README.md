# DraftCut

**[English](#english)** · **[中文](#中文)**

---

## English

**DraftCut is an AI skill for quickly turning raw footage into a first cut.**

Give the AI a folder of videos/photos and a simple brief, like “make a 60-second Tokyo travel vlog.” DraftCut helps the AI watch the material, pick useful moments, arrange a rough sequence, and show the result as a playful **hand-drawn storyboard**.

The point is not to replace your editor. It helps you get past the hardest early step: **what should I keep, and what order should it go in?**

![Hand-drawn storyboard: scan → pick highlights → timeline → export](docs/screenshots/storyboard-tokyo-timeline-en.png)

### The Problem

Raw footage is messy. A trip, vlog, food shoot, product demo, or talking-head session can leave you with dozens or hundreds of clips. Before you can edit, you still need to scrub everything, remember what is inside, find highlights, and build a story.

DraftCut makes that first pass faster.

### What the Skill Does

- Looks through a folder of footage
- Understands what each clip is about
- Finds highlights and useful moments
- Builds a rough sequence from your brief
- Shows the cut as a hand-drawn timeline/storyboard
- Lets you preview, drag, trim, and export for CapCut / FCPXML

### How You Use It

Tell your AI:

> Use DraftCut on this footage folder. Make a 60-second travel vlog.

DraftCut is the skill that tells the AI what to do next: inspect the footage, analyze it, make choices, create the storyboard, and prepare an editable project.

### Why It’s Fun

Most video tools start with a blank professional timeline. DraftCut starts with a **sketchy storyboard**: thumbnails, tracks, notes, rhythm, and a hand-drawn feel. It makes the rough-cut stage feel like planning a story, not managing a spreadsheet.

For people wiring it up themselves: the skill lives in `SKILL.md`; the rest of the repo is the small toolkit it uses.

---

## 中文

**DraftCut 是一个 AI Skill，用来把一堆原始素材快速变成初剪方案。**

你给 AI 一个视频/照片文件夹，再说一句目标，比如「做一个 60 秒东京旅行 vlog」。DraftCut 会让 AI 去看素材、筛高光、排顺序，然后生成一个很有意思的**手绘风 storyboard**。

它不是替代剪辑软件，也不直接渲染成片。它解决的是剪辑最前面、最烦的那一步：**这些素材里哪些值得留？应该怎么排？**

![手绘风 storyboard：扫素材 → 筛高光 → 排时间线 → 导出](docs/screenshots/storyboard-tokyo-timeline-en.png)

### 它解决什么问题

原始素材通常很乱。一次旅行、vlog、探店、产品展示、口播拍摄，可能留下几十上百个文件。真正开始剪之前，你还得逐条看、记内容、找高光、想结构。

DraftCut 就是帮 AI 快速做这件事。

### 这个 Skill 会做什么

- 扫描一个素材文件夹
- 理解每个视频/照片大概拍了什么
- 找出高光和有用片段
- 根据你的 brief 搭出第一版顺序
- 生成手绘风时间线 / storyboard
- 让你预览、拖拽、裁剪，并导出到剪映 / FCPXML

### 怎么用

你只需要跟 AI 说：

> 用 DraftCut 处理这个素材文件夹，做一个 60 秒旅行 vlog。

DraftCut 这个 skill 会告诉 AI 接下来怎么做：看素材、分析、筛选、串联、打开 storyboard、准备可编辑工程。

### 为什么有意思

很多剪辑工具一上来就是冰冷的专业时间线。DraftCut 先给你一个**像手稿一样的 storyboard**：缩略图、轨道、注释、节奏线，都能看、能拖、能改。它让初剪阶段更像是在搭故事，而不是整理表格。

如果你要自己接入：`SKILL.md` 是 skill 本体，仓库里的其它文件只是它调用的小工具。
