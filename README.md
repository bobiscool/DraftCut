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
