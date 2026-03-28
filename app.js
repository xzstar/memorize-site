const STORAGE_KEY = 'memorize-site-state-v1';

const EXAMPLES = {
  zh: `床前明月光，疑是地上霜。举头望明月，低头思故乡。\n\n少年智则国智，少年富则国富，少年强则国强。`,
  en: `We hold these truths to be self-evident, that all men are created equal.\n\nSuccess is the sum of small efforts, repeated day in and day out.`,
};

const DEFAULT_OPTIONS = {
  practiceMode: 'classic',
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
      reviewText: normalizedText,
      language: 'zh',
      roundType: 'full',
      sentences: [],
    };
  }

  const language = resolveLanguage(normalizedText, options.languageMode);
  const sentences = splitSentences(normalizedText, language).map((sentence) => processSentence(sentence, language, options));

  return {
    originalText: text,
    normalizedText,
    reviewText: normalizedText,
    language,
    roundType: 'full',
    sentences,
  };
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatLanguageLabel(language) {
  return language === 'zh' ? '中文' : '英文';
}

function getExerciseSessionKey(exercise) {
  return exercise.sentences.map((sentence) => sentence.id).join('|');
}

function createSentenceSession(exercise) {
  return {
    exerciseKey: getExerciseSessionKey(exercise),
    currentIndex: 0,
    revealed: false,
    ratings: exercise.sentences.map(() => null),
  };
}

function ensureSentenceSession(exercise, session) {
  if (!exercise?.sentences?.length) return null;

  const exerciseKey = getExerciseSessionKey(exercise);
  if (!session || session.exerciseKey !== exerciseKey) {
    return createSentenceSession(exercise);
  }

  return session;
}

function getSentenceProgress(session) {
  const ratings = session?.ratings || [];
  const remembered = ratings.filter((rating) => rating === 'remembered').length;
  const forgotten = ratings.filter((rating) => rating === 'forgotten').length;
  const completed = remembered + forgotten;

  return {
    remembered,
    forgotten,
    completed,
    total: ratings.length,
    remaining: Math.max(ratings.length - completed, 0),
  };
}

function getEmptyStateMarkup(practiceMode) {
  if (practiceMode === 'sentence') {
    return `
      <article class="empty-state">
        <h3>先贴一段内容，再开始逐句闯关</h3>
        <p>系统会按句生成挖空练习，然后带你一轮轮完成“先背、再看、再自评”的训练流程。</p>
      </article>
    `;
  }

  return `
    <article class="empty-state">
      <h3>先贴一段内容再开始</h3>
      <p>每次生成时，系统会按句随机减少 10%~20% 的文字，让你通过回忆来完成背诵。</p>
    </article>
  `;
}

function getReviewText(exercise) {
  return exercise.reviewText || exercise.normalizedText;
}

function createMistakeRetryExercise(exercise, session, options) {
  const retrySourceSentences = exercise.sentences
    .filter((_, index) => session.ratings[index] === 'forgotten')
    .map((sentence) => sentence.original);

  if (!retrySourceSentences.length) {
    return null;
  }

  return {
    originalText: retrySourceSentences.join('\n'),
    normalizedText: retrySourceSentences.join('\n'),
    reviewText: getReviewText(exercise),
    language: exercise.language,
    roundType: 'mistake-retry',
    sentences: retrySourceSentences.map((sentence) => processSentence(sentence, exercise.language, options)),
  };
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

function renderSentenceMode(exercise, session) {
  const progress = getSentenceProgress(session);

  if (!progress.total) {
    return getEmptyStateMarkup('sentence');
  }

  if (session.currentIndex >= progress.total) {
    const mistakeItems = exercise.sentences
      .map((sentence, index) => ({ sentence, index, rating: session.ratings[index] }))
      .filter((item) => item.rating === 'forgotten');

    return `
      <section class="sentence-summary">
        <article class="summary-hero">
          <p class="panel-kicker">本轮完成</p>
          <h3>${exercise.roundType === 'mistake-retry' ? '这一轮错句重练已经结束' : '这一轮逐句练习已经结束'}</h3>
          <p>${exercise.roundType === 'mistake-retry' ? '你刚完成了一轮错句强化，可以继续查看整篇原文和这轮仍未记住的句子。' : '回看整篇原文，再集中复盘刚才标记为“没记住”的句子。'}</p>
          ${mistakeItems.length ? `
            <div class="summary-actions">
              <button class="primary-button" type="button" data-action="retry-mistakes">只练错句</button>
            </div>
          ` : ''}
        </article>

        <div class="summary-stats">
          <article class="summary-stat">
            <span class="summary-stat-label">总句数</span>
            <strong>${progress.total}</strong>
          </article>
          <article class="summary-stat">
            <span class="summary-stat-label">记住了</span>
            <strong>${progress.remembered}</strong>
          </article>
          <article class="summary-stat">
            <span class="summary-stat-label">没记住</span>
            <strong>${progress.forgotten}</strong>
          </article>
        </div>

        <article class="summary-section">
          <div class="summary-section-top">
            <div>
              <p class="panel-kicker">整篇回看</p>
              <h3>完整原文</h3>
            </div>
          </div>
          <div class="summary-passage-text">${escapeHtml(getReviewText(exercise))}</div>
        </article>

        <article class="summary-section">
          <div class="summary-section-top">
            <div>
              <p class="panel-kicker">错句复盘</p>
              <h3>本轮待加强的句子</h3>
            </div>
          </div>
          ${mistakeItems.length ? `
            <div class="mistake-list">
              ${mistakeItems.map(({ sentence, index }) => `
                <article class="mistake-item">
                  <div class="sentence-index">第 ${index + 1} 句</div>
                  <div class="sentence-original">${escapeHtml(sentence.original)}</div>
                </article>
              `).join('')}
            </div>
          ` : `
            <div class="empty-inline-state">这轮全部标记为“记住了”，可以直接重新随机挑战下一轮。</div>
          `}
        </article>
      </section>
    `;
  }

  const currentSentence = exercise.sentences[session.currentIndex];
  const progressPercent = Math.round((progress.completed / progress.total) * 100);

  return `
    <section class="sentence-session">
      <article class="session-progress">
        <div class="session-progress-copy">
          <p class="panel-kicker">逐句闯关</p>
          <h3>第 ${session.currentIndex + 1} / ${progress.total} 句</h3>
          <p>先自己背一遍，再点“查看答案”，最后标记这一句是否真的记住。</p>
        </div>
        <div class="session-progress-pill">${progressPercent}%</div>
      </article>

      <article class="sentence-card sentence-focus-card">
        <div class="sentence-top">
          <div class="sentence-index">当前练习</div>
          <div class="sentence-stats">已标记 ${progress.completed} 句 · 剩余 ${progress.remaining} 句</div>
        </div>
        <div class="sentence-masked sentence-focus-text">${escapeHtml(currentSentence.masked)}</div>
        ${session.revealed ? `
          <div class="sentence-reveal">
            <div class="sentence-reveal-label">原文对照</div>
            <div class="sentence-original">${escapeHtml(currentSentence.original)}</div>
          </div>
        ` : `
          <div class="sentence-tip">先在心里或口头背诵，再点击下方按钮看答案。</div>
        `}
      </article>

      <div class="sentence-mode-actions">
        ${session.revealed ? `
          <button class="secondary-button rating-button rating-button-remembered" type="button" data-action="remembered">这句记住了</button>
          <button class="secondary-button rating-button rating-button-forgotten" type="button" data-action="forgotten">这句没记住</button>
        ` : `
          <button class="primary-button" type="button" data-action="reveal">查看答案</button>
        `}
      </div>
    </section>
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

function collectSentenceModeText(exercise, session) {
  const progress = getSentenceProgress(session);

  if (!progress.total) {
    return '';
  }

  if (session.currentIndex >= progress.total) {
    const lines = [
      '逐句练习总结',
      `总句数：${progress.total}`,
      `记住了：${progress.remembered}`,
      `没记住：${progress.forgotten}`,
      '',
      '完整原文',
      getReviewText(exercise),
    ];

    const mistakeLines = exercise.sentences
      .map((sentence, index) => ({ sentence, index, rating: session.ratings[index] }))
      .filter((item) => item.rating === 'forgotten')
      .map((item) => `第 ${item.index + 1} 句\n${item.sentence.original}`);

    if (mistakeLines.length) {
      lines.push('', '错句列表', mistakeLines.join('\n\n'));
    }

    return lines.join('\n\n');
  }

  const currentSentence = exercise.sentences[session.currentIndex];
  const lines = [
    `第 ${session.currentIndex + 1} / ${progress.total} 句`,
    currentSentence.masked,
  ];

  if (session.revealed) {
    lines.push('', `原文：${currentSentence.original}`);
  }

  return lines.join('\n\n');
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
  const practiceMode = document.querySelector('#practiceMode');
  const languageMode = document.querySelector('#languageMode');
  const hideMode = document.querySelector('#hideMode');
  const fixedRatio = document.querySelector('#fixedRatio');
  const hideStyle = document.querySelector('#hideStyle');
  const fixedRatioField = document.querySelector('#fixedRatioField');
  const results = document.querySelector('#results');
  const statusBar = document.querySelector('#statusBar');
  const resultMeta = document.querySelector('#resultMeta');
  const resultTitle = document.querySelector('#resultTitle');
  const toggleAnswerButton = document.querySelector('#toggleAnswerButton');

  let showOriginal = false;
  let lastExercise = null;
  let sentenceSession = null;

  const persisted = loadPersistedState();
  if (persisted) {
    sourceText.value = persisted.text || '';
    practiceMode.value = persisted.practiceMode || DEFAULT_OPTIONS.practiceMode;
    languageMode.value = persisted.languageMode || DEFAULT_OPTIONS.languageMode;
    hideMode.value = persisted.hideMode || DEFAULT_OPTIONS.hideMode;
    fixedRatio.value = String(persisted.fixedRatio ?? DEFAULT_OPTIONS.fixedRatio);
    hideStyle.value = persisted.hideStyle || DEFAULT_OPTIONS.hideStyle;
  }

  function getOptions() {
    return {
      practiceMode: practiceMode.value,
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

  function syncPracticeModeUi() {
    const isSentenceMode = practiceMode.value === 'sentence';
    const sentenceTitle = lastExercise?.roundType === 'mistake-retry' ? '错句重练' : '逐句闯关';
    resultTitle.textContent = isSentenceMode ? sentenceTitle : '整段练习';
    toggleAnswerButton.classList.toggle('is-hidden', isSentenceMode);
  }

  function refreshMeta(exercise) {
    if (practiceMode.value === 'sentence') {
      sentenceSession = ensureSentenceSession(exercise, sentenceSession);
      const progress = getSentenceProgress(sentenceSession);
      const roundLabel = exercise.roundType === 'mistake-retry' ? '错句重练' : '逐句闯关';

      if (!progress.total) {
        resultMeta.textContent = '尚未生成';
        return;
      }

      if (sentenceSession.currentIndex >= progress.total) {
        resultMeta.textContent = `${formatLanguageLabel(exercise.language)} · ${roundLabel} · ${progress.total} 句 · 记住 ${progress.remembered} 句 · 待加强 ${progress.forgotten} 句`;
        return;
      }

      resultMeta.textContent = `${formatLanguageLabel(exercise.language)} · ${roundLabel} · 第 ${sentenceSession.currentIndex + 1}/${progress.total} 句 · 已标记 ${progress.completed} 句`;
      return;
    }

    const totalHidden = exercise.sentences.reduce((sum, sentence) => sum + sentence.hiddenCount, 0);
    resultMeta.textContent = `${formatLanguageLabel(exercise.language)} · ${exercise.sentences.length} 句 · 共隐藏 ${totalHidden} 个单位`;
  }

  function renderExercise(exercise) {
    syncPracticeModeUi();

    if (!exercise.sentences.length) {
      results.innerHTML = getEmptyStateMarkup(practiceMode.value);
      resultMeta.textContent = '尚未生成';
      return;
    }

    if (practiceMode.value === 'sentence') {
      sentenceSession = ensureSentenceSession(exercise, sentenceSession);
      results.innerHTML = renderSentenceMode(exercise, sentenceSession);
      refreshMeta(exercise);
      return;
    }

    results.innerHTML = exercise.sentences.map((sentence, index) => renderSentenceCard(sentence, index, showOriginal)).join('');

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
      sentenceSession = null;
      renderExercise({ sentences: [] });
      return;
    }

    lastExercise = generateExercise(text, getOptions());
    sentenceSession = createSentenceSession(lastExercise);
    renderExercise(lastExercise);
    statusBar.textContent = practiceMode.value === 'sentence'
      ? '已进入逐句闯关模式，先自己背一遍，再点“查看答案”。'
      : '已生成新的练习版本，可以继续重新随机。';
  }

  document.querySelector('#generateButton').addEventListener('click', generate);

  document.querySelector('#reshuffleButton').addEventListener('click', () => {
    if (!preprocessText(sourceText.value)) {
      statusBar.textContent = '请先输入内容，再重新随机。';
      return;
    }

    generate();
    statusBar.textContent = practiceMode.value === 'sentence'
      ? '已开始新的逐句练习顺序，本轮状态也已重置。'
      : '已重新随机，每句话的缺失位置都更新了。';
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

    const content = practiceMode.value === 'sentence'
      ? collectSentenceModeText(lastExercise, ensureSentenceSession(lastExercise, sentenceSession))
      : collectVisibleText(lastExercise, showOriginal);

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
    sentenceSession = null;
    saveCurrentControls();
    renderExercise({ sentences: [] });
    statusBar.textContent = '已清空输入内容。';
  });

  results.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton || practiceMode.value !== 'sentence' || !lastExercise) {
      return;
    }

    sentenceSession = ensureSentenceSession(lastExercise, sentenceSession);
    if (!sentenceSession) {
      return;
    }

    const progress = getSentenceProgress(sentenceSession);
    if (!progress.total) {
      return;
    }

    if (actionButton.dataset.action === 'retry-mistakes') {
      if (sentenceSession.currentIndex < progress.total) {
        return;
      }

      const retryExercise = createMistakeRetryExercise(lastExercise, sentenceSession, getOptions());
      if (!retryExercise) {
        statusBar.textContent = '这一轮没有“没记住”的句子，暂时不需要错句重练。';
        return;
      }

      lastExercise = retryExercise;
      sentenceSession = createSentenceSession(lastExercise);
      renderExercise(lastExercise);
      statusBar.textContent = `已开始只练错句，本轮共 ${lastExercise.sentences.length} 句。`;
      return;
    }

    if (sentenceSession.currentIndex >= progress.total) {
      return;
    }

    if (actionButton.dataset.action === 'reveal') {
      sentenceSession.revealed = true;
      renderExercise(lastExercise);
      statusBar.textContent = '已显示当前句原文，请标记自己是否真的记住。';
      return;
    }

    if (!sentenceSession.revealed) {
      return;
    }

    if (!['remembered', 'forgotten'].includes(actionButton.dataset.action)) {
      return;
    }

    const currentSentenceNumber = sentenceSession.currentIndex + 1;
    sentenceSession.ratings[sentenceSession.currentIndex] = actionButton.dataset.action;
    sentenceSession.revealed = false;

    if (sentenceSession.currentIndex >= progress.total - 1) {
      sentenceSession.currentIndex = progress.total;
      renderExercise(lastExercise);
      statusBar.textContent = lastExercise.roundType === 'mistake-retry'
        ? '本轮错句重练已完成，可以继续回看整篇原文和剩余错句。'
        : '本轮逐句练习已完成，可以回看整篇原文和错句列表。';
      return;
    }

    sentenceSession.currentIndex += 1;
    renderExercise(lastExercise);
    statusBar.textContent = actionButton.dataset.action === 'remembered'
      ? `已标记第 ${currentSentenceNumber} 句为“记住了”，继续下一句。`
      : `已标记第 ${currentSentenceNumber} 句为“没记住”，继续下一句。`;
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

  practiceMode.addEventListener('change', () => {
    syncPracticeModeUi();
    saveCurrentControls();

    if (lastExercise) {
      if (lastExercise.roundType === 'mistake-retry') {
        lastExercise = generateExercise(sourceText.value, getOptions());
        sentenceSession = createSentenceSession(lastExercise);
      }

      sentenceSession = practiceMode.value === 'sentence'
        ? ensureSentenceSession(lastExercise, sentenceSession)
        : sentenceSession;
      renderExercise(lastExercise);
      statusBar.textContent = practiceMode.value === 'sentence'
        ? '已切换到逐句闯关模式。'
        : '已切换到整段练习模式。';
      return;
    }

    renderExercise({ sentences: [] });
  });

  syncFixedRatioVisibility();
  syncPracticeModeUi();

  if (preprocessText(sourceText.value)) {
    generate();
  } else {
    renderExercise({ sentences: [] });
  }
}

if (typeof document !== 'undefined') {
  initApp();
}
