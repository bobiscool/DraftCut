// Shared UI + progress strings · zh / en / ja
export const LANGS = ['zh', 'en', 'ja'];

export function normalizeLang(l) {
  if (!l) return 'zh';
  const x = String(l).toLowerCase().slice(0, 2);
  if (x === 'zh' || x === 'cn') return 'zh';
  if (x === 'en') return 'en';
  if (x === 'ja' || x === 'jp') return 'ja';
  return 'zh';
}

const STR = {
  zh: {
    storyboard: '分镜编排手稿',
    connecting: '连接中…',
    scan: '扫描', transcribe: '转写', read: '分析', seq: '编排', draw: '完成',
    phase_scan: '扫描素材', phase_transcribe: '音频转写', phase_read: '多模态分析',
    phase_seq: '生成编排', phase_style: '匹配风格', phase_draw: '编排完成', phase_export: '导出工程',
    progress_scanning: '素材解析中', msg_scan_start: '扫描素材（视频+图片）',
    msg_scan_file: '均匀抽帧', msg_read_sheet: '拼 contact sheet', msg_read_vlm: '理解整段情节',
    msg_seq: '等待编排', ready: '编排就绪 · 可预览微调', seq_updating: '编排更新中…',
    stopped: '扫描已停止', defaultBrief: '旅行 vlog', sourceMissing: '源文件不存在',
    saved: '已保存', saveFailed: '保存失败', exporting: '导出中', exportDone: '导出完成', exportFailed: '导出失败',
    noImage: '无缩略图', noDescription: '（无描述）', musicAdded: '已加音乐', musicSuggested: '推荐配乐',
    beatSynced: '已卡点', musicPreview: '播放＝按拍同步预览（视频静音）', candidates: '备选',
    playAll: '▶ 播放全片', stop: '⏹ 停止', audMusic: '🎵 听音乐', audVideo: '🔊 听原片',
    save: '💾 保存修改', exportMontage: '⬇ 导出 montage.json',
    expFcpxml: '🎬 导出 FCPXML', expJy: '✂️ 导出 剪映',
    tlHint: '时间线：拖动片段移动 / 拖右缘裁剪 · 点「本线」片段试播',
    zoomHint: '时间线可缩放 · 横滚查看',
    footer: 'DraftCut · 手绘多轨编排，不渲染成片 · 导出 FCPXML / 剪映工程后在 PR/剪映里继续做',
    ph: '▶ 点「播放全片」或时间线上「本线」的片段开始预览',
    phSub: '（按编排顺序播各镜头入出点；有音乐则按拍同步，视频静音）',
    style: '风格', aspect: '画幅', target: '目标', edit: '本线', clips: '镜头', tracks: '轨道',
    language: '语言', lang_zh: '中文', lang_en: '英文', lang_ja: '日文',
    sourceDir: '素材目录', chooseFolder: '选择…', briefLabel: '目标', durationLabel: '成片时长', scanFromWeb: '开始扫描', scanning: '扫描中…',
    sourcePlaceholder: '/path/to/footage', briefPlaceholder: '例如：东京旅行 vlog', startingScan: '正在启动扫描…',
    scanStartFailed: '启动扫描失败', pickFolderFailed: '选择目录失败', seconds: '秒', currentWork: '当前 work',
    track_main: '本线', track_story: '主线', track_sub: '支线', track_sub2: '支线2', track_bgm: '配乐', track_emo: '情感线',
    ai_lang: '请用简体中文撰写所有字段',
  },
  en: {
    storyboard: 'Storyboard',
    connecting: 'Connecting…',
    scan: 'Scan', transcribe: 'Transcribe', read: 'Analyze', seq: 'Sequence', draw: 'Done',
    phase_scan: 'Scanning media', phase_transcribe: 'Transcribing audio', phase_read: 'Vision analysis',
    phase_seq: 'Building edit', phase_style: 'Matching style', phase_draw: 'Storyboard ready', phase_export: 'Exporting',
    progress_scanning: 'Analyzing media', msg_scan_start: 'Scanning videos & images',
    msg_scan_file: 'Extracting frames', msg_read_sheet: 'Building contact sheet', msg_read_vlm: 'Understanding scene',
    msg_seq: 'Waiting for sequence', ready: 'Edit ready · preview & tweak', seq_updating: 'Updating sequence…',
    stopped: 'Scan stopped', defaultBrief: 'Travel vlog', sourceMissing: 'Source file missing',
    saved: 'Saved', saveFailed: 'Save failed', exporting: 'Exporting', exportDone: 'Export complete', exportFailed: 'Export failed',
    noImage: 'No thumbnail', noDescription: '(No description)', musicAdded: 'Music added', musicSuggested: 'Suggested music',
    beatSynced: 'Beat synced', musicPreview: 'Preview syncs to music · source muted', candidates: 'Alternatives',
    playAll: '▶ Play All', stop: '⏹ Stop', audMusic: '🎵 Music', audVideo: '🔊 Source',
    save: '💾 Save', exportMontage: '⬇ Export montage.json',
    expFcpxml: '🎬 Export FCPXML', expJy: '✂️ Export CapCut',
    tlHint: 'Timeline: drag clips · trim right edge · click to preview',
    zoomHint: 'Zoom · scroll horizontally',
    footer: 'DraftCut · hand-drawn multi-track edit plan · export FCPXML / CapCut project',
    ph: '▶ Click <b>Play All</b> or a clip on the timeline',
    phSub: 'Plays in/out points in order · video muted when music sync is on',
    style: 'Style', aspect: 'Aspect', target: 'Target', edit: 'Edit', clips: 'Clips', tracks: 'Tracks',
    language: 'Language', lang_zh: 'Chinese', lang_en: 'English', lang_ja: 'Japanese',
    sourceDir: 'Media folder', chooseFolder: 'Choose…', briefLabel: 'Brief', durationLabel: 'Duration', scanFromWeb: 'Start Scan', scanning: 'Scanning…',
    sourcePlaceholder: '/path/to/footage', briefPlaceholder: 'e.g. Tokyo travel vlog', startingScan: 'Starting scan…',
    scanStartFailed: 'Failed to start scan', pickFolderFailed: 'Failed to choose folder', seconds: 'sec', currentWork: 'Current work',
    track_main: 'Main', track_story: 'Story', track_sub: 'Subplot', track_sub2: 'Subplot 2', track_bgm: 'Music', track_emo: 'Emotion',
    ai_lang: 'Write all fields in English',
  },
  ja: {
    storyboard: '絵コンテ',
    connecting: '接続中…',
    scan: 'スキャン', transcribe: '文字起こし', read: '分析', seq: '編集', draw: '完了',
    phase_scan: '素材スキャン', phase_transcribe: '音声文字起こし', phase_read: '映像分析',
    phase_seq: '編集生成', phase_style: 'スタイル', phase_draw: '絵コンテ完成', phase_export: '書き出し',
    progress_scanning: '素材解析中', msg_scan_start: '動画・画像をスキャン',
    msg_scan_file: 'フレーム抽出', msg_read_sheet: 'コンタクトシート作成', msg_read_vlm: 'シーン理解',
    msg_seq: '編集待ち', ready: '編集完了 · プレビュー可能', seq_updating: '編集中…',
    stopped: 'スキャン停止', defaultBrief: '旅行 vlog', sourceMissing: 'ソースファイルなし',
    saved: '保存しました', saveFailed: '保存失敗', exporting: '書き出し中', exportDone: '書き出し完了', exportFailed: '書き出し失敗',
    noImage: 'サムネイルなし', noDescription: '（説明なし）', musicAdded: '音楽追加済み', musicSuggested: 'おすすめ音楽',
    beatSynced: 'ビート同期済み', musicPreview: '音楽に同期してプレビュー（動画はミュート）', candidates: '候補',
    playAll: '▶ 全体再生', stop: '⏹ 停止', audMusic: '🎵 音楽', audVideo: '🔊 原音',
    save: '💾 保存', exportMontage: '⬇ montage.json 出力',
    expFcpxml: '🎬 FCPXML 出力', expJy: '✂️ CapCut 出力',
    tlHint: 'タイムライン：ドラッグで移動 · 右端でトリム · クリックで試写',
    zoomHint: 'ズーム · 横スクロール',
    footer: 'DraftCut · 手描き多轨編集 · FCPXML / CapCut 書き出し',
    ph: '▶ 「全体再生」またはタイムラインのクリップをクリック',
    phSub: '入出点順に再生 · 音楽同期時は動画ミュート',
    style: 'スタイル', aspect: '画幅', target: '目標', edit: '本編', clips: 'クリップ', tracks: 'トラック',
    language: '言語', lang_zh: '中国語', lang_en: '英語', lang_ja: '日本語',
    sourceDir: '素材フォルダ', chooseFolder: '選択…', briefLabel: '目的', durationLabel: '長さ', scanFromWeb: 'スキャン開始', scanning: 'スキャン中…',
    sourcePlaceholder: '/path/to/footage', briefPlaceholder: '例：東京旅行 vlog', startingScan: 'スキャン開始中…',
    scanStartFailed: 'スキャン開始失敗', pickFolderFailed: 'フォルダ選択失敗', seconds: '秒', currentWork: '現在の work',
    track_main: '本編', track_story: 'ストーリー', track_sub: 'サブ', track_sub2: 'サブ2', track_bgm: 'BGM', track_emo: '感情線',
    ai_lang: 'すべてのフィールドを日本語で書いてください',
  },
};

export function t(lang, key, vars = {}) {
  const L = normalizeLang(lang);
  let s = STR[L]?.[key] ?? STR.zh[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export function phaseLabel(lang, phase) {
  return t(lang, `phase_${phase}`, {}) || phase;
}

const TRACK_MAP = {
  zh: {},
  en: { 本线: 'Main', 主线: 'Story', 支线: 'Subplot', 支线2: 'Subplot 2', 配乐: 'Music', Bgm: 'Music', 情感线: 'Emotion' },
  ja: { 本线: '本編', 主线: 'ストーリー', 支线: 'サブ', 支线2: 'サブ2', 配乐: 'BGM', Bgm: 'BGM', 情感线: '感情線' },
};

export function trackName(lang, name) {
  const L = normalizeLang(lang);
  return TRACK_MAP[L]?.[name] || name;
}

export function buildReadPrompt(lang, asset, frameLines, fullText) {
  const L = normalizeLang(lang);
  const kind = asset.type === 'image'
    ? (L === 'ja' ? '画像' : L === 'en' ? 'image' : '图片')
    : (L === 'ja' ? '動画' : L === 'en' ? 'video' : '视频');
  const titleHint = L === 'en'
    ? 'Short title in English (max 8 words, no hook/intro)'
    : L === 'ja'
      ? '日本語の短いタイトル（8文字以内、hook/intro 等の英語禁止）'
      : '中文短标题（8字内，不要用 hook/intro 等英文）';
  const intro = L === 'en'
    ? `You analyze footage for video editing. Contact sheet of one ${kind} (≤20 frames, left-to-right, top-to-bottom).`
    : L === 'ja'
      ? `你是剪辑素材分析助手。同一${kind}的 contact sheet（最多20格，时间顺序排列）。`
      : `你是剪辑素材分析助手。同一${kind}的 contact sheet（最多20格，按时间从左到右、从上到下）。`;
  const task = L === 'en'
    ? `Understand the whole ${kind} as one story (not frame-by-frame). Output JSON only. ${t(L, 'ai_lang')}.`
    : L === 'ja'
      ? `整段${kind}の情节を把握（コマごとにしない）。JSONのみ出力。${t(L, 'ai_lang')}。`
      : `理解整段${kind}在讲什么，不要逐格碎裂描述。只输出 JSON。${t(L, 'ai_lang')}。`;
  return [
    intro,
    fullText ? (L === 'en' ? `Transcript:\n"${fullText}"\n` : L === 'ja' ? `【文字起こし】\n"${fullText}"\n` : `【语音转写】\n"${fullText}"\n`) : '',
    task,
    'JSON schema:',
    '{',
    '  "videoSummary": "2-4 sentences",',
    '  "contentType": "travel|food|landscape|product|tutorial|vlog|other",',
    '  "narrativeBeats": ["3-8 key events in time order"],',
    '  "bestMoments": [{"frame":1,"t":0.0,"reason":"why highlight","highlight":0.9}],',
    `  "title": "${titleHint}",`,
    '  "mood": ["..."], "tags": ["..."]',
    '}',
    `File: ${asset.file} (${asset.type}, ${asset.dur?.toFixed(1) || 0}s)`,
    L === 'en' ? 'Frames:' : L === 'ja' ? 'フレーム:' : '采样帧:',
    frameLines,
  ].filter(Boolean).join('\n');
}

export { STR };
