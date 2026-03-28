const STORAGE_KEY = 'memorize-site-state-v1';

const EXAMPLES = {
  zh: `床前明月光，疑是地上霜。举头望明月，低头思故乡。\n\n少年智则国智，少年富则国富，少年强则国强。`,
  en: `We hold these truths to be self-evident, that all men are created equal.\n\nSuccess is the sum of small efforts, repeated day in and day out.`,
};

const DEFAULT_OPTIONS = {
  languageMode: 'auto',
  hideMode: 'random-range',
  fixedRatio: 0.15,
  hideRange: { min: 0.1, max: 0.2 },
  hideStyle: 'underline',
};

export function preprocessText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function resolveLanguage(text, mode = 'auto') {
  if (mode === 'zh' || mode === 'en') return mode;

  const zhCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const enCount = (text.match(/[A-Za-z]/g) || []).length;
  return zhCount >= enCount ? 'zh' : 'en';
}

function splitBySentenceEndings(text, endings) {
  const sentences = [];
  let buffer = '';

  for (const char of text) {
    if (char === '\n') {
      const trimmed = buffer.trim();
      if (trimmed) sentences.push(trimmed);
      buffer = '';
      continue;
    }

    buffer += char;

    if (endings.has(char)) {
      const trimmed = buffer.trim();
      if (trimmed) sentences.push(trimmed);
      buffer = '';
    }
  }

  const trailing = buffer.trim();
  if (trailing) sentences.push(trailing);
  return sentences;
}

export function splitSentences(text, language) {
  return language === 'zh'
    ? splitBySentenceEndings(text, new Set(['。', '！', '？', '；']))
    : splitBySentenceEndings(text, new Set(['.', '!', '?', ';']));
}

export function tokenizeChinese(sentence) {
  return Array.from(sentence).map((char) => {
    if (char === '\n') {
      return { text: char, type: 'newline', hideable: false, hidden: false };
    }

    if (/\s/.test(char)) {
      return { text: char, type: 'space', hideable: false, hidden: false };
    }

    if (/[\u4e00-\u9fff]/.test(char)) {
      return { text: char, type: 'char', hideable: true, hidden: false };
    }

    return { text: char, type: 'punct', hideable: false, hidden: false };
  });
}

export function tokenizeEnglish(sentence) {
  const parts = sentence.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*|[^\w\s]|\s+/g) || [];

  return parts.map((part) => {
    if (part === '\n') {
      return { text: part, type: 'newline', hideable: false, hidden: false };
    }

    if (/^\s+$/.test(part)) {
      return { text: part, type: 'space', hideable: false, hidden: false };
    }

    if (/^[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*$/.test(part)) {
      return { text: part, type: 'word', hideable: true, hidden: false };
    }

    return { text: part, type: 'punct', hideable: false, hidden: false };
  });
}

export function tokenizeSentence(sentence, language) {
  return language === 'zh' ? tokenizeChinese(sentence) : tokenizeEnglish(sentence);
}

export function getHideableIndexes(tokens) {
  return tokens.flatMap((token, index) => (token.hideable ? [index] : []));
}

export function resolveHideRatio(options) {
  if (options.hideMode === 'fixed') {
    return Number(options.fixedRatio) || DEFAULT_OPTIONS.fixedRatio;
  }

  const min = options.hideRange?.min ?? DEFAULT_OPTIONS.hideRange.min;
  const max = options.hideRange?.max ?? DEFAULT_OPTIONS.hideRange.max;
  return Math.random() * (max - min) + min;
}

export function calculateHideCount(hideableCount, ratio, language) {
  if (hideableCount <= 0) return 0;
  if ((language === 'zh' && hideableCount <= 5) || (language === 'en' && hideableCount <= 4)) {
    return 1;
  }

  const raw = Math.floor(hideableCount * ratio);
  const minimum = 1;
  const maximum = Math.max(1, Math.floor(hideableCount * 0.2));
  return Math.max(minimum, Math.min(raw || minimum, maximum));
}

export function pickRandomIndexes(indexes, count) {
  const pool = [...indexes];

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, count);
}

export function markHiddenTokens(tokens, hiddenIndexes) {
  const hiddenSet = new Set(hiddenIndexes);
  return tokens.map((token, index) => ({
    ...token,
    hidden: hiddenSet.has(index),
  }));
}

export function renderHiddenToken(token, language, style) {
  if (!token.hidden) return token.text;

  if (language === 'zh') {
    if (style === 'block') return '□';
    if (style === 'mask') return '•';
    return '_';
  }

  const length = Math.max(3, token.text.length);
  if (style === 'block') return '□'.repeat(length);
  if (style === 'mask') return '•'.repeat(length);
  return '_'.repeat(length);
}

export function renderMaskedSentence(tokens, language, style) {
  return tokens.map((token) => renderHiddenToken(token, language, style)).join('');
}

export function processSentence(sentence, language, options) {
  const tokens = tokenizeSentence(sentence, language);
  const hideableIndexes = getHideableIndexes(tokens);
  const ratio = resolveHideRatio(options);
  const hideCount = calculateHideCount(hideableIndexes.length, ratio, language);
  const hiddenIndexes = pickRandomIndexes(hideableIndexes, hideCount);
  const maskedTokens = markHiddenTokens(tokens, hiddenIndexes);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    original: sentence,
    masked: renderMaskedSentence(maskedTokens, language, options.hideStyle),
    language,
    hideRatio: ratio,
    hiddenCount: hideCount,
    totalHideableCount: hideableIndexes.length,
    tokens: maskedTokens,
  };
}

export function generateExercise(text, options = DEFAULT_OPTIONS) {
  const normalizedText = preprocessText(text);
  if (!normalizedText) {
    return {
      originalText: text,
      normalizedText,
      language: 'zh',
      sentences: [],
    };
  }

  const language = resolveLanguage(normalizedText, options.languageMode);
  const sentences = splitSentences(normalizedText, language).map((sentence) => processSentence(sentence, language, options));

  return {
    originalText: text,
    normalizedText,
    language,
    sentences,
  };
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function renderSentenceCard(sentence, index, showOriginal) {
  return `
    <article class="sentence-card">
      <div class="sentence-top">
        <div class="sentence-index">第 ${index + 1} 句</div>
        <div class="sentence-stats">隐藏 ${sentence.hiddenCount}/${sentence.totalHideableCount} · ${formatPercent(sentence.hideRatio)}</div>
      </div>
      <div class="sentence-masked">${escapeHtml(showOriginal ? sentence.original : sentence.masked)}</div>
      ${showOriginal ? `<div class="sentence-original">原文：${escapeHtml(sentence.original)}</div>` : ''}
    </article>
  `;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function collectVisibleText(exercise, showOriginal) {
  return exercise.sentences
    .map((sentence, index) => `第 ${index + 1} 句\n${showOriginal ? sentence.original : sentence.masked}`)
    .join('\n\n');
}

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persistState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
  }
}

function initApp() {
  const sourceText = document.querySelector('#sourceText');
  const languageMode = document.querySelector('#languageMode');
  const hideMode = document.querySelector('#hideMode');
  const fixedRatio = document.querySelector('#fixedRatio');
  const hideStyle = document.querySelector('#hideStyle');
  const fixedRatioField = document.querySelector('#fixedRatioField');
  const results = document.querySelector('#results');
  const statusBar = document.querySelector('#statusBar');
  const resultMeta = document.querySelector('#resultMeta');
  const toggleAnswerButton = document.querySelector('#toggleAnswerButton');

  let showOriginal = false;
  let lastExercise = null;

  const persisted = loadPersistedState();
  if (persisted) {
    sourceText.value = persisted.text || '';
    languageMode.value = persisted.languageMode || DEFAULT_OPTIONS.languageMode;
    hideMode.value = persisted.hideMode || DEFAULT_OPTIONS.hideMode;
    fixedRatio.value = String(persisted.fixedRatio ?? DEFAULT_OPTIONS.fixedRatio);
    hideStyle.value = persisted.hideStyle || DEFAULT_OPTIONS.hideStyle;
  }

  function getOptions() {
    return {
      languageMode: languageMode.value,
      hideMode: hideMode.value,
      fixedRatio: Number(fixedRatio.value),
      hideRange: DEFAULT_OPTIONS.hideRange,
      hideStyle: hideStyle.value,
    };
  }

  function syncFixedRatioVisibility() {
    fixedRatioField.classList.toggle('is-hidden', hideMode.value !== 'fixed');
  }

  function refreshMeta(exercise) {
    const totalHidden = exercise.sentences.reduce((sum, sentence) => sum + sentence.hiddenCount, 0);
    resultMeta.textContent = `${exercise.language === 'zh' ? '中文' : '英文'} · ${exercise.sentences.length} 句 · 共隐藏 ${totalHidden} 个单位`;
  }

  function renderExercise(exercise) {
    if (!exercise.sentences.length) {
      results.innerHTML = `
        <article class="empty-state">
          <h3>还没有可练习的内容</h3>
          <p>请输入至少一句完整的中文或英文，再点击“生成练习”。</p>
        </article>
      `;
      resultMeta.textContent = '尚未生成';
      return;
    }

    results.innerHTML = exercise.sentences
      .map((sentence, index) => renderSentenceCard(sentence, index, showOriginal))
      .join('');

    refreshMeta(exercise);
  }

  function saveCurrentControls() {
    persistState({
      text: sourceText.value,
      ...getOptions(),
    });
  }

  function generate() {
    const text = sourceText.value;
    const normalized = preprocessText(text);

    saveCurrentControls();

    if (!normalized) {
      statusBar.textContent = '请先输入需要背诵的内容。';
      lastExercise = null;
      renderExercise({ sentences: [] });
      return;
    }

    lastExercise = generateExercise(text, getOptions());
    renderExercise(lastExercise);
    statusBar.textContent = '已生成新的练习版本，可以继续重新随机。';
  }

  document.querySelector('#generateButton').addEventListener('click', generate);

  document.querySelector('#reshuffleButton').addEventListener('click', () => {
    if (!preprocessText(sourceText.value)) {
      statusBar.textContent = '请先输入内容，再重新随机。';
      return;
    }

    generate();
    statusBar.textContent = '已重新随机，每句话的缺失位置都更新了。';
  });

  toggleAnswerButton.addEventListener('click', () => {
    showOriginal = !showOriginal;
    toggleAnswerButton.textContent = showOriginal ? '隐藏原文' : '显示原文';

    if (lastExercise) {
      renderExercise(lastExercise);
      statusBar.textContent = showOriginal ? '当前显示原文对照。' : '当前仅显示挖空版本。';
    }
  });

  document.querySelector('#copyButton').addEventListener('click', async () => {
    if (!lastExercise || !lastExercise.sentences.length) {
      statusBar.textContent = '还没有可复制的练习结果。';
      return;
    }

    const content = collectVisibleText(lastExercise, showOriginal);

    try {
      await navigator.clipboard.writeText(content);
      statusBar.textContent = '已复制当前可见结果。';
    } catch {
      statusBar.textContent = '复制失败，请手动选中内容复制。';
    }
  });

  document.querySelector('#clearTextButton').addEventListener('click', () => {
    sourceText.value = '';
    lastExercise = null;
    saveCurrentControls();
    renderExercise({ sentences: [] });
    statusBar.textContent = '已清空输入内容。';
  });

  document.querySelectorAll('[data-example]').forEach((button) => {
    button.addEventListener('click', () => {
      sourceText.value = EXAMPLES[button.dataset.example] || '';
      saveCurrentControls();
      generate();
    });
  });

  [sourceText, languageMode, hideMode, fixedRatio, hideStyle].forEach((element) => {
    element.addEventListener('input', saveCurrentControls);
    element.addEventListener('change', () => {
      syncFixedRatioVisibility();
      saveCurrentControls();
    });
  });

  syncFixedRatioVisibility();

  if (preprocessText(sourceText.value)) {
    generate();
  }
}

if (typeof document !== 'undefined') {
  initApp();
}
