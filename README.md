# DraftCut

> AI 拆视频 · 分析素材 · 自己串联 · 输出**手绘风分镜编排图 HTML**。
> 一个 **agent skill**，不是 app。**它不渲染成片**——只产出"怎么剪"的决策蓝图。

和 `aicut` 的区别：aicut 渲染 mp4；montage 只画那张「导演脑子里的编排图」。

## 它做什么

```
素材文件夹  →  拆 CUT  →  析 READ  →  串 SEQ  →  绘 DRAW
                shots.json  analysis.json  montage.json  storyboard.html
```

1. **拆 CUT** — ffmpeg 场景检测切镜头、抽关键帧、采音频能量。
2. **析 READ** — 关键帧拼图喂视觉模型，给每个镜头打标签 + 高光分。
3. **串 SEQ** — agent 当导演：选片、排序、分叙事角色、定转场节奏卡点，写 `montage.json`（核心交付，不渲染）。
4. **绘 DRAW** — 把 `montage.json` 渲成**手绘风 SVG 多轨时间线** `storyboard.html`：本线/主线/支线/Bgm/支线2/**情感线**多轨共用时间轴，可播放预览、按拍同步、拖拽微调、导出回写。

## 快速看效果

```bash
node scripts/build-storyboard.mjs examples/montage.json examples/storyboard.sample.html
open examples/storyboard.sample.html
```

## 作为 skill 安装

把整个目录放进 `~/.claude/skills/montage/`（或项目的 `.claude/skills/`），
然后对 agent 说：「把这个文件夹的素材拆一下、串个 30 秒的片、出一张编排图」。
agent 会读 `SKILL.md` 按四阶段执行。

## 依赖

- `ffmpeg` / `ffprobe`（拆 + 析）
- `node`（绘）
- 一个视觉/文本模型（GLM / DeepSeek / Qwen-VL，模型无关）

## 目录

```
SKILL.md                  # skill 指令（核心）
DESIGN.md                 # 设计构思
scripts/
  detect-shots.sh         # 拆：场景检测 + 关键帧
  contact-sheet.sh        # 析：关键帧拼图
  build-storyboard.mjs    # 绘：montage.json -> storyboard.html
library/*.md              # 剪辑模板库（提示词库），可被 userDirs 扩展
templates/storyboard.html # 手绘风模板（带样例数据，可直接打开）
examples/montage.json     # 编排决策数据契约样例
```

## 设计与待定项

见 `DESIGN.md` 第 6 节（仓库名 / 默认视觉模型 / 是否交互 / 是否出 Storyline.md）。

## 模板库（提示词库）

`library/` 是可扩展的"怎么剪"知识库。每个 `.md` = 导演提示词 + 机器约束（节奏/结构/转场/配乐方向）。
阶段3 据此匹配推荐风格，阶段4 串联时当导演指令喂模型。

```bash
node scripts/library.mjs list        # 看清单
node scripts/library.mjs json        # 给 agent 匹配用
node scripts/library.mjs show food-vlog
```

内置：`food-vlog` `beat-sync` `emotional-slow` `travel-montage` `talking-head`。
自定义：把你的 `.md` 放进 `~/.draftcut/library`（config `library.userDirs`）即可新增/覆盖。
