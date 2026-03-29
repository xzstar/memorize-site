const STORAGE_KEY = 'memorize-site-state-v1';

const EXAMPLES = {
  zh: `床前明月光，疑是地上霜。举头望明月，低头思故乡。\n\n少年智则国智，少年富则国富，少年强则国强。`,
  en: `We hold these truths to be self-evident, that all men are created equal.\n\nSuccess is the sum of small efforts, repeated day in and day out.`,
};

const SENTENCE_CHALLENGE_LEVELS = [0.2, 0.4, 0.6, 0.8];

const DEFAULT_OPTIONS = {
  practiceMode: 'classic',
  sentenceChallengeIndex: 0,
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
  const maximum = Math.max(1, hideableCount - 1);
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

function getSentenceChallengeRatio(index) {
  return SENTENCE_CHALLENGE_LEVELS[index] ?? SENTENCE_CHALLENGE_LEVELS[0];
}

function splitChallengeSections(normalizedText, language) {
  if (!normalizedText) {
    return [];
  }

  let startSentenceIndex = 0;

  return normalizedText
    .split(/\n{2,}/)
    .map((sectionText) => sectionText.trim())
    .filter(Boolean)
    .map((sectionText, index) => {
      const sentences = splitSentences(sectionText, language);
      const section = {
        key: `section-${index}`,
        index,
        label: `第 ${index + 1} 段`,
        normalizedText: sectionText,
        sentences,
        startSentenceIndex,
      };

      startSentenceIndex += sentences.length;
      return section;
    });
}

function createStageDefinition(key, baseKey, label, unitLabel, scopeText, scopeSentences, sectionIndex = null, extra = {}) {
  return {
    key,
    baseKey,
    label,
    unitLabel,
    scopeText,
    scopeSentences,
    sectionIndex,
    ...extra,
  };
}

function buildSectionStageDefinitions(section, multiSection) {
  const prefix = multiSection ? `${section.label} · ` : '';
  const stages = [
    createStageDefinition(
      `${section.key}-single`,
      'single',
      `${prefix}单句关`,
      '句',
      section.normalizedText,
      section.sentences,
      section.index,
    ),
  ];

  if (section.sentences.length >= 3) {
    stages.push(createStageDefinition(
      `${section.key}-double-overlap`,
      'double-overlap',
      `${prefix}双句重叠`,
      '题',
      section.normalizedText,
      section.sentences,
      section.index,
    ));
  }

  if (section.sentences.length >= 6) {
    stages.push(createStageDefinition(
      `${section.key}-triple-overlap`,
      'triple-overlap',
      `${prefix}三句重叠`,
      '题',
      section.normalizedText,
      section.sentences,
      section.index,
    ));
  }

  if (multiSection || section.sentences.length > 1) {
    stages.push(createStageDefinition(
      `${section.key}-full-passage`,
      'full-passage',
      `${prefix}${multiSection ? '本段总关' : '整段总关'}`,
      '题',
      section.normalizedText,
      section.sentences,
      section.index,
    ));
  }

  return stages;
}

function insertReviewStages(contentStages) {
  if (!contentStages.length) {
    return contentStages;
  }

  const stages = [];

  for (let index = 0; index < contentStages.length; index += 1) {
    stages.push(contentStages[index]);

    if ((index + 1) % 3 === 0) {
      const reviewGroup = contentStages.slice(index - 2, index + 1);
      const startStage = index - 1;
      const endStage = index + 1;

      stages.push(createStageDefinition(
        `review-${startStage}-${endStage}`,
        'review',
        `复现关 · 第 ${startStage}-${endStage} 关`,
        '题',
        '',
        [],
        null,
        {
          reviewStageKeys: reviewGroup.map((stage) => stage.key),
          reviewStageRange: [startStage, endStage],
        },
      ));
    }
  }

  return stages;
}

function getChallengeStageDefinitions(challengeSections, normalizedText) {
  const contentStages = challengeSections.length <= 1
    ? buildSectionStageDefinitions(
      challengeSections[0] || { key: 'section-0', index: 0, label: '第 1 段', normalizedText, sentences: [] },
      false,
    )
    : (() => {
      const stages = challengeSections.flatMap((section) => buildSectionStageDefinitions(section, true));
      stages.push(createStageDefinition(
        'full-passage',
        'full-passage',
        '整篇总关',
        '题',
        normalizedText,
        challengeSections.flatMap((section) => section.sentences),
      ));
      return stages;
    })();

  return insertReviewStages(contentStages);
}

function createChallengeSource(text, options) {
  const normalizedText = preprocessText(text);
  if (!normalizedText) {
    return {
      sourceText: text,
      normalizedText,
      language: 'zh',
      sourceSentences: [],
      challengeSections: [],
      challengeStagePerformance: {},
      challengeStages: getChallengeStageDefinitions([], normalizedText),
    };
  }

  const language = resolveLanguage(normalizedText, options.languageMode);
  const sourceSentences = splitSentences(normalizedText, language);
  const challengeSections = splitChallengeSections(normalizedText, language);

  return {
    sourceText: text,
    normalizedText,
    language,
    sourceSentences,
    challengeSections,
    challengeStagePerformance: {},
    challengeStages: getChallengeStageDefinitions(challengeSections, normalizedText),
  };
}

function getChallengeStageMeta(challengeStages, stageKey) {
  return challengeStages.find((stage) => stage.key === stageKey) || challengeStages[0] || { key: 'single', label: '单句关', unitLabel: '句' };
}

function joinChallengeUnitTexts(unitTexts, language) {
  return language === 'en' ? unitTexts.join(' ') : unitTexts.join('');
}

function countChallengePromptUnits(text, language) {
  return getHideableIndexes(tokenizeSentence(text, language)).length;
}

function getMinimumSinglePromptUnits(language) {
  return language === 'en' ? 15 : 10;
}

function buildSingleStageUnits(stageMeta, source, language) {
  const globalSentences = source.sourceSentences || [];
  if (!globalSentences.length) {
    return stageMeta.scopeSentences || [];
  }

  const section = typeof stageMeta.sectionIndex === 'number'
    ? source.challengeSections?.[stageMeta.sectionIndex]
    : null;
  const startIndex = section?.startSentenceIndex ?? 0;
  const unitCount = section?.sentences?.length ?? (stageMeta.scopeSentences?.length || globalSentences.length);
  const minimumUnits = getMinimumSinglePromptUnits(language);

  return Array.from({ length: unitCount }, (_, offset) => {
    const unitTexts = [];
    let cursor = startIndex + offset;

    while (cursor < globalSentences.length) {
      unitTexts.push(globalSentences[cursor]);
      const combinedText = joinChallengeUnitTexts(unitTexts, language);

      if (countChallengePromptUnits(combinedText, language) >= minimumUnits || cursor === globalSentences.length - 1) {
        return combinedText;
      }

      cursor += 1;
    }

    return joinChallengeUnitTexts(unitTexts, language);
  });
}

function buildChallengeStageUnits(stageMeta, source, language) {
  const sourceSentences = stageMeta.scopeSentences || [];
  const normalizedText = stageMeta.scopeText || '';

  if (stageMeta.baseKey === 'review') {
    return (stageMeta.reviewStageKeys || []).flatMap((stageKey) => {
      const reviewSourceStage = getChallengeStageMeta(source.challengeStages, stageKey);
      const baseUnits = buildChallengeStageUnits(reviewSourceStage, source, language);
      const weakIndexes = source.challengeStagePerformance?.[stageKey]?.weakIndexes || [];
      const weakSet = new Set(weakIndexes);

      return baseUnits.flatMap((unitText, index) => (weakSet.has(index) ? [unitText, unitText] : [unitText]));
    });
  }

  if (stageMeta.baseKey === 'single') {
    return buildSingleStageUnits(stageMeta, source, language);
  }

  if (stageMeta.baseKey === 'triple-overlap') {
    if (sourceSentences.length < 3) {
      return normalizedText ? [normalizedText] : sourceSentences;
    }

    return sourceSentences.slice(0, -2).map((sentence, index) => joinChallengeUnitTexts([
      sentence,
      sourceSentences[index + 1],
      sourceSentences[index + 2],
    ], language));
  }

  if (stageMeta.baseKey === 'double-overlap') {
    if (sourceSentences.length < 2) {
      return normalizedText ? [normalizedText] : sourceSentences;
    }

    return sourceSentences.slice(0, -1).map((sentence, index) => joinChallengeUnitTexts([sentence, sourceSentences[index + 1]], language));
  }

  if (stageMeta.baseKey === 'full-passage') {
    return normalizedText ? [normalizedText] : sourceSentences;
  }

  return sourceSentences;
}

function getSentenceChallengeOptions(options, difficultyIndex) {
  return {
    ...options,
    hideMode: 'fixed',
    fixedRatio: getSentenceChallengeRatio(difficultyIndex),
  };
}

function decorateSentenceChallengeExercise(exercise, difficultyIndex, roundType = 'full', reviewText = exercise.normalizedText) {
  return {
    ...exercise,
    reviewText,
    roundType,
    challengeLevelIndex: difficultyIndex,
    challengeRatio: getSentenceChallengeRatio(difficultyIndex),
  };
}

function buildChallengeExerciseFromSource(source, options, difficultyIndex, stageKey = 'single', roundType = 'full', reviewText = source.normalizedText) {
  const stageMeta = getChallengeStageMeta(source.challengeStages, stageKey);
  const stageUnits = buildChallengeStageUnits(stageMeta, source, source.language);
  const challengeOptions = getSentenceChallengeOptions(options, difficultyIndex);

  return decorateSentenceChallengeExercise({
    originalText: source.sourceText,
    sourceText: source.sourceText,
    normalizedText: source.normalizedText,
    language: source.language,
    sourceSentences: source.sourceSentences,
    challengeSections: source.challengeSections,
    challengeStagePerformance: source.challengeStagePerformance || {},
    challengeStages: source.challengeStages,
    challengeStageKey: stageMeta.key,
    challengeStageIndex: source.challengeStages.findIndex((stage) => stage.key === stageMeta.key),
    challengeStageLabel: stageMeta.label,
    challengeUnitLabel: stageMeta.unitLabel,
    challengeSectionIndex: stageMeta.sectionIndex,
    sentences: stageUnits.map((unitText) => processSentence(unitText, source.language, challengeOptions)),
  }, difficultyIndex, roundType, reviewText);
}

function buildChallengeExerciseFromUnits(exercise, unitTexts, options, difficultyIndex, roundType) {
  const challengeOptions = getSentenceChallengeOptions(options, difficultyIndex);

  return decorateSentenceChallengeExercise({
    originalText: exercise.originalText,
    sourceText: exercise.sourceText,
    normalizedText: exercise.normalizedText,
    language: exercise.language,
    sourceSentences: exercise.sourceSentences,
    challengeSections: exercise.challengeSections,
    challengeStagePerformance: exercise.challengeStagePerformance || {},
    challengeStages: exercise.challengeStages,
    challengeStageKey: exercise.challengeStageKey,
    challengeStageIndex: exercise.challengeStageIndex,
    challengeStageLabel: exercise.challengeStageLabel,
    challengeUnitLabel: exercise.challengeUnitLabel,
    challengeSectionIndex: exercise.challengeSectionIndex,
    sentences: unitTexts.map((unitText) => processSentence(unitText, exercise.language, challengeOptions)),
  }, difficultyIndex, roundType, getReviewText(exercise));
}

function generateSentenceChallengeExercise(text, options, difficultyIndex, stageKey = 'single') {
  return buildChallengeExerciseFromSource(createChallengeSource(text, options), options, difficultyIndex, stageKey);
}

function rebuildChallengeSourceFromExercise(exercise) {
  const sourceText = exercise.sourceText ?? exercise.originalText;
  const normalizedText = exercise.normalizedText;
  const language = exercise.language;
  const sourceSentences = exercise.sourceSentences || splitSentences(normalizedText, language);
  const challengeSections = exercise.challengeSections || splitChallengeSections(normalizedText, language);

  return {
    sourceText,
    normalizedText,
    language,
    sourceSentences,
    challengeSections,
    challengeStagePerformance: exercise.challengeStagePerformance || {},
    challengeStages: exercise.challengeStages || getChallengeStageDefinitions(challengeSections, normalizedText),
  };
}

function createSentenceItemState() {
  return {
    skipped: false,
    reshuffles: 0,
  };
}

function ensureSentenceItemStates(session, sentenceCount) {
  const itemStates = session?.itemStates || [];
  return Array.from({ length: sentenceCount }, (_, index) => ({
    ...createSentenceItemState(),
    ...(itemStates[index] || {}),
  }));
}

function isWeakChallengeItem(session, index) {
  const rating = session?.ratings?.[index];
  const itemState = session?.itemStates?.[index] || createSentenceItemState();
  return rating === 'forgotten' || itemState.skipped || itemState.reshuffles >= 2;
}

function recordChallengeStagePerformance(exercise, session) {
  if (!exercise?.challengeStageKey || !session) {
    return exercise?.challengeStagePerformance || {};
  }

  const weakIndexes = exercise.sentences.reduce((indexes, _, index) => {
    if (isWeakChallengeItem(session, index)) {
      indexes.push(index);
    }

    return indexes;
  }, []);

  return {
    ...(exercise.challengeStagePerformance || {}),
    [exercise.challengeStageKey]: {
      weakIndexes,
    },
  };
}

function regenerateSentenceChallengeExercise(exercise, options, difficultyIndex) {
  if (exercise.roundType === 'mistake-retry') {
    return buildChallengeExerciseFromUnits(
      exercise,
      exercise.sentences.map((sentence) => sentence.original),
      options,
      difficultyIndex,
      exercise.roundType,
    );
  }

  return buildChallengeExerciseFromSource(
    rebuildChallengeSourceFromExercise(exercise),
    options,
    difficultyIndex,
    exercise.challengeStageKey || 'single',
    exercise.roundType,
    getReviewText(exercise),
  );
}

function formatLanguageLabel(language) {
  return language === 'zh' ? '中文' : '英文';
}

function formatSentenceChallengeLabel(difficultyIndex) {
  return formatPercent(getSentenceChallengeRatio(difficultyIndex));
}

function getChallengeSectionProgress(exercise) {
  const totalSections = exercise.challengeSections?.length || 0;
  const currentStage = getChallengeStageMeta(exercise.challengeStages || [], exercise.challengeStageKey || 'single');

  if (currentStage.baseKey === 'review') {
    const [startStage, endStage] = currentStage.reviewStageRange || [];
    return {
      label: `复现第 ${startStage}-${endStage} 关，按原顺序完整回顾`,
      shortLabel: `复现第 ${startStage}-${endStage} 关`,
    };
  }

  if (totalSections <= 1) {
    return null;
  }

  if (typeof exercise.challengeSectionIndex === 'number') {
    return {
      label: `当前第 ${exercise.challengeSectionIndex + 1} / ${totalSections} 段`,
      shortLabel: `第 ${exercise.challengeSectionIndex + 1} 段 / 共 ${totalSections} 段`,
    };
  }

  return {
    label: `已完成前 ${totalSections} 段，正在挑战整篇总关`,
    shortLabel: `已完成 ${totalSections}/${totalSections} 段`,
  };
}

function isFinalBossStage(exercise) {
  const currentStage = getChallengeStageMeta(exercise.challengeStages || [], exercise.challengeStageKey || 'single');
  return currentStage.baseKey === 'full-passage' && !getNextChallengeStage(exercise);
}

function isReviewStage(exercise) {
  const currentStage = getChallengeStageMeta(exercise.challengeStages || [], exercise.challengeStageKey || 'single');
  return currentStage.baseKey === 'review';
}

function getFinalBossCopy(exercise) {
  const hasSections = (exercise.challengeSections?.length || 0) > 1;

  return {
    badge: 'Final Boss',
    introTitle: hasSections ? '所有分段都已经完成，开始整篇总关' : '最后一关：整篇总关',
    introDescription: hasSections
      ? '这次不再只练单段，而是把整篇顺序、衔接和节奏一次性串起来。'
      : '现在要把整篇内容一次性串起来，这是当前文本的最终挑战。',
    previewLabel: hasSections ? '先看整篇原文' : '先看整段原文',
    previewTip: hasSections
      ? '先在脑中把整篇顺序完整走一遍，再开始最终测试。'
      : '先把整段整体过一遍，再开始最终测试。',
    testingTip: hasSections
      ? '这是整篇总关，可以继续重新随机整篇挖空版本，再反复冲刺。'
      : '这是最后一关，可以继续重新随机整段挖空版本，再反复冲刺。',
    summarySuccessTitle: '整篇总关通关了',
    summarySuccessDescription: '这一轮已经把全文顺序和衔接完整串起来，可以继续冲更高难度，或者再刷一轮稳固手感。',
    summaryReviewTitle: '整篇总关已完成，回看最后的断点',
    summaryReviewDescription: '整篇已经跑完一轮，先把还不稳的地方补齐，再回来继续冲击最终通关。',
  };
}

function getNextChallengeStage(exercise) {
  const currentIndex = exercise.challengeStageIndex ?? 0;
  return exercise.challengeStages?.[currentIndex + 1] || null;
}

function createNextStageChallengeExercise(exercise, session, options, difficultyIndex) {
  const nextStage = getNextChallengeStage(exercise);
  if (!nextStage) {
    return null;
  }

  const source = rebuildChallengeSourceFromExercise(exercise);

  return buildChallengeExerciseFromSource(
    {
      ...source,
      challengeStagePerformance: recordChallengeStagePerformance(exercise, session),
    },
    options,
    difficultyIndex,
    nextStage.key,
  );
}

function getExerciseSessionKey(exercise) {
  return exercise.sentences.map((sentence) => sentence.id).join('|');
}

function createSentenceSession(exercise) {
  return {
    exerciseKey: getExerciseSessionKey(exercise),
    currentIndex: 0,
    stage: 'preview',
    ratings: exercise.sentences.map(() => null),
    itemStates: exercise.sentences.map(() => createSentenceItemState()),
  };
}

function ensureSentenceSession(exercise, session) {
  if (!exercise?.sentences?.length) return null;

  const exerciseKey = getExerciseSessionKey(exercise);
  if (!session || session.exerciseKey !== exerciseKey) {
    return createSentenceSession(exercise);
  }

  return {
    ...session,
    itemStates: ensureSentenceItemStates(session, exercise.sentences.length),
  };
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
        <h3>先贴一段内容，再开始闯关训练</h3>
        <p>系统会先从单句关开始；如果原文按段落分开，长文会优先按原段落拆关，再进入整篇总关。</p>
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

  return buildChallengeExerciseFromUnits(
    exercise,
    retrySourceSentences,
    options,
    exercise.challengeLevelIndex ?? DEFAULT_OPTIONS.sentenceChallengeIndex,
    'mistake-retry',
  );
}

function reshuffleSentence(sentence, language, options) {
  return {
    ...processSentence(sentence.original, language, options),
    id: sentence.id,
  };
}

function reshuffleCurrentSentence(exercise, session, options) {
  if (!exercise?.sentences?.length || session.currentIndex >= exercise.sentences.length) {
    return exercise;
  }

  return {
    ...exercise,
    sentences: exercise.sentences.map((sentence, index) => {
      if (index !== session.currentIndex) return sentence;
      return reshuffleSentence(sentence, exercise.language, options);
    }),
  };
}

function updatePendingChallengeDifficulty(exercise, session, options, difficultyIndex) {
  if (!exercise?.sentences?.length) {
    return exercise;
  }

  return decorateSentenceChallengeExercise({
    ...exercise,
    sentences: exercise.sentences.map((sentence, index) => {
      if (index < session.currentIndex) {
        return sentence;
      }

      return reshuffleSentence(sentence, exercise.language, getSentenceChallengeOptions(options, difficultyIndex));
    }),
  }, difficultyIndex, exercise.roundType, getReviewText(exercise));
}

function getSentenceRoundRecommendation(exercise, session) {
  const progress = getSentenceProgress(session);
  const currentIndex = exercise.challengeLevelIndex ?? DEFAULT_OPTIONS.sentenceChallengeIndex;
  const currentLabel = formatSentenceChallengeLabel(currentIndex);
  const nextStage = exercise.roundType === 'mistake-retry' ? null : getNextChallengeStage(exercise);
  const finalBoss = isFinalBossStage(exercise);
  const bossCopy = finalBoss ? getFinalBossCopy(exercise) : null;

  if (progress.forgotten > 0) {
    if (currentIndex > 0) {
      const fallbackIndex = currentIndex - 1;
      const fallbackLabel = formatSentenceChallengeLabel(fallbackIndex);
      return {
        title: finalBoss ? `整篇总关在 ${currentLabel} 有点卡住了` : `这一轮在 ${currentLabel} 有点卡住了`,
        description: finalBoss
          ? `建议先回到 ${fallbackLabel} 稳住整篇顺序，再回来继续冲击 ${currentLabel}。`
          : `建议先回到 ${fallbackLabel} 稳住，再继续挑战 ${currentLabel}。`,
        primaryAction: 'jump-difficulty',
        primaryLabel: `回到 ${fallbackLabel}`,
        primaryLevel: fallbackIndex,
        secondaryAction: 'retry-current',
        secondaryLabel: `重练 ${currentLabel}`,
      };
    }

    return {
      title: finalBoss ? `先把整篇总关的 ${currentLabel} 练稳` : `先把 ${currentLabel} 这一档练稳`,
      description: finalBoss
        ? '可以继续重练整篇，也可以先只练错题，把整篇里的断点补起来。'
        : '可以继续重练当前难度，或者只练错题把断点先补起来。',
      primaryAction: 'retry-current',
      primaryLabel: `重练 ${currentLabel}`,
      secondaryAction: 'retry-mistakes',
      secondaryLabel: '只练错题',
    };
  }

  if (currentIndex < SENTENCE_CHALLENGE_LEVELS.length - 1) {
    const nextIndex = currentIndex + 1;
    const nextLabel = formatSentenceChallengeLabel(nextIndex);
    return {
      title: finalBoss ? `整篇总关的 ${currentLabel} 已经比较稳了` : `${currentLabel} 已经比较稳了`,
      description: finalBoss
        ? `可以直接升到 ${nextLabel} 冲击最终通关，也可以再刷一轮整篇总关。`
        : nextStage
        ? `可以直接升到 ${nextLabel}，也可以进入 ${nextStage.label} 继续推进。`
        : `可以直接升到 ${nextLabel}，也可以继续留在当前档多刷几轮。`,
      primaryAction: 'jump-difficulty',
      primaryLabel: `升到 ${nextLabel}`,
      primaryLevel: nextIndex,
      secondaryAction: finalBoss ? 'retry-current' : (nextStage ? 'next-stage' : 'retry-current'),
      secondaryLabel: finalBoss ? '再刷一轮整篇总关' : (nextStage ? `进入${nextStage.label}` : `重练 ${currentLabel}`),
    };
  }

  if (nextStage) {
    return {
      title: `${currentLabel} 已经打通，准备进下一关`,
      description: `可以继续进入 ${nextStage.label}，也可以留在当前关卡巩固 80% 难度。`,
      primaryAction: 'next-stage',
      primaryLabel: `进入${nextStage.label}`,
      secondaryAction: 'retry-current',
      secondaryLabel: '重练 80%',
    };
  }

  if (finalBoss && bossCopy) {
    return {
      title: bossCopy.summarySuccessTitle,
      description: bossCopy.summarySuccessDescription,
      primaryAction: 'retry-current',
      primaryLabel: '再刷一轮整篇总关',
      secondaryAction: 'jump-difficulty',
      secondaryLabel: '回到 60% 快速巩固',
      secondaryLevel: Math.max(SENTENCE_CHALLENGE_LEVELS.length - 2, 0),
    };
  }

  return {
    title: '你已经来到最终关卡的 80% 最高档',
    description: '可以继续留在最高档反复巩固，把最难的一层练扎实。',
    primaryAction: 'retry-current',
    primaryLabel: '重练 80%',
  };
}

function renderSentenceChallengeBar(exercise) {
  const currentIndex = exercise.challengeLevelIndex ?? DEFAULT_OPTIONS.sentenceChallengeIndex;
  const sectionProgress = getChallengeSectionProgress(exercise);

  return `
    <div class="challenge-level-bar">
      <div class="challenge-level-copy">
        <span class="challenge-level-label">当前关卡</span>
        <strong>${exercise.challengeStageLabel || '单句关'}</strong>
        <span class="challenge-level-meta">挑战难度 ${formatSentenceChallengeLabel(currentIndex)}</span>
        ${sectionProgress ? `<span class="challenge-section-meta">${sectionProgress.label}</span>` : ''}
      </div>
      <div class="challenge-level-buttons">
        ${SENTENCE_CHALLENGE_LEVELS.map((_, index) => `
          <button
            class="ghost-button challenge-level-button${index === currentIndex ? ' is-active' : ''}"
            type="button"
            data-action="jump-difficulty"
            data-level="${index}"
          >${formatSentenceChallengeLabel(index)}</button>
        `).join('')}
      </div>
    </div>
  `;
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
  const finalBoss = isFinalBossStage(exercise);
  const reviewStage = isReviewStage(exercise);
  const bossCopy = finalBoss ? getFinalBossCopy(exercise) : null;
  const sectionProgress = getChallengeSectionProgress(exercise);

  if (!progress.total) {
    return getEmptyStateMarkup('sentence');
  }

  if (session.currentIndex >= progress.total) {
    const mistakeItems = exercise.sentences
      .map((sentence, index) => ({ sentence, index, rating: session.ratings[index] }))
      .filter((item) => item.rating === 'forgotten');
    const recommendation = getSentenceRoundRecommendation(exercise, session);
    const stageLabel = exercise.challengeStageLabel || '当前关卡';
    const summaryTitle = finalBoss && bossCopy
      ? (progress.forgotten ? bossCopy.summaryReviewTitle : bossCopy.summarySuccessTitle)
      : (exercise.roundType === 'mistake-retry' ? `这一轮 ${stageLabel} 错题重练已经结束` : `这一轮 ${stageLabel} 已经结束`);
    const summaryDescription = finalBoss && bossCopy
      ? (progress.forgotten ? bossCopy.summaryReviewDescription : bossCopy.summarySuccessDescription)
      : (exercise.roundType === 'mistake-retry' ? '你刚完成了一轮错题强化，可以继续查看整篇原文和这轮仍未记住的内容。' : '回看整篇原文，再集中复盘刚才标记为“没记住”的内容。');

    return `
      <section class="sentence-summary">
        <article class="summary-hero${finalBoss ? ' is-final-boss' : ''}">
          <p class="panel-kicker">本轮完成</p>
          ${finalBoss && bossCopy ? `<span class="boss-stage-badge">${bossCopy.badge}</span>` : ''}
          <h3>${summaryTitle}</h3>
          <p>${summaryDescription}</p>
          ${renderSentenceChallengeBar(exercise)}
          <div class="challenge-recommendation">
            <strong>${recommendation.title}</strong>
            <p>${recommendation.description}</p>
            <div class="summary-actions">
              <button
                class="primary-button"
                type="button"
                data-action="${recommendation.primaryAction}"
                ${typeof recommendation.primaryLevel === 'number' ? `data-level="${recommendation.primaryLevel}"` : ''}
              >${recommendation.primaryLabel}</button>
              ${!recommendation.secondaryAction || (recommendation.secondaryAction === 'retry-mistakes' && !mistakeItems.length) ? '' : `
                <button
                  class="secondary-button"
                  type="button"
                  data-action="${recommendation.secondaryAction}"
                  ${typeof recommendation.secondaryLevel === 'number' ? `data-level="${recommendation.secondaryLevel}"` : ''}
                >${recommendation.secondaryLabel}</button>
              `}
            </div>
          </div>
          ${mistakeItems.length && recommendation.secondaryAction !== 'retry-mistakes' ? `
            <div class="summary-actions">
              <button class="secondary-button" type="button" data-action="retry-mistakes">只练错题</button>
            </div>
          ` : ''}
        </article>

        <div class="summary-stats">
          <article class="summary-stat">
            <span class="summary-stat-label">总题数</span>
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
              <p class="panel-kicker">错题复盘</p>
              <h3>本轮待加强的内容</h3>
            </div>
          </div>
          ${mistakeItems.length ? `
            <div class="mistake-list">
              ${mistakeItems.map(({ sentence, index }) => `
                <article class="mistake-item">
                  <div class="sentence-index">第 ${index + 1} 题</div>
                  <div class="sentence-original">${escapeHtml(sentence.original)}</div>
                </article>
              `).join('')}
            </div>
          ` : `
            <div class="empty-inline-state">这轮全部标记为“记住了”，可以直接继续下一轮挑战。</div>
          `}
        </article>
      </section>
    `;
  }

  const currentSentence = exercise.sentences[session.currentIndex];
  const progressPercent = Math.round((progress.completed / progress.total) * 100);
  const isPreviewStage = session.stage === 'preview';
  const isRevealStage = session.stage === 'revealed';
  const roundLabel = exercise.roundType === 'mistake-retry'
    ? `${exercise.challengeStageLabel || '当前关卡'} · 错题重练`
    : (exercise.challengeStageLabel || '单句关');
  const unitLabel = exercise.challengeUnitLabel || '题';
  const stageIntroTitle = finalBoss && bossCopy ? bossCopy.introTitle : null;
  const stageIntroDescription = finalBoss && bossCopy ? bossCopy.introDescription : null;
  const previewLabel = finalBoss && bossCopy ? bossCopy.previewLabel : '先看原文';
  const previewTip = finalBoss && bossCopy
      ? bossCopy.previewTip
      : (reviewStage ? '这一关会把前面三关按原顺序完整回顾一遍；刚才跳过、没记住或反复重新随机的题会额外再过一遍。' : '确认自己理解了这一题，再点击下方按钮进入测试。');
  const testingTip = finalBoss && bossCopy
    ? bossCopy.testingTip
    : (reviewStage ? '这是复现关，题目会按课文原顺序回放；薄弱题会紧跟原题额外重复一次。' : '先在心里或口头背诵，再点击下方按钮看答案。');

  return `
    <section class="sentence-session">
      ${finalBoss && bossCopy ? `
        <article class="boss-stage-banner">
          <div class="boss-stage-top">
            <span class="boss-stage-badge">${bossCopy.badge}</span>
            ${sectionProgress ? `<span class="boss-stage-progress">${sectionProgress.label}</span>` : ''}
          </div>
          <h3>${stageIntroTitle}</h3>
          <p>${stageIntroDescription}</p>
        </article>
      ` : ''}

      <article class="session-progress">
        <div class="session-progress-copy">
          <p class="panel-kicker">${roundLabel}</p>
          <h3>第 ${session.currentIndex + 1} / ${progress.total} ${unitLabel}</h3>
          <p>${finalBoss && bossCopy ? '先把全文顺序在脑中串起来，再开始最终测试；需要的话可以重新随机整篇挖空，也可以直接跳过这一题。' : (reviewStage ? '这是复现关，会把前面三关的内容按原顺序完整回放；刚才跳过、没记住或反复重新随机的题会紧跟原题再练一次。' : '先看当前内容原文，再开始测试；需要的话可以重新随机当前题，也可以直接跳过。')}</p>
        </div>
        <div class="session-progress-pill">${progressPercent}%</div>
      </article>

      ${renderSentenceChallengeBar(exercise)}

      <article class="sentence-card sentence-focus-card">
        <div class="sentence-top">
          <div class="sentence-index">当前练习</div>
          <div class="sentence-stats">已标记 ${progress.completed} ${unitLabel} · 剩余 ${progress.remaining} ${unitLabel}</div>
        </div>
        ${isPreviewStage ? `
          <div class="sentence-reveal sentence-preview-block">
            <div class="sentence-reveal-label">${previewLabel}</div>
            <div class="sentence-original sentence-preview-text">${escapeHtml(currentSentence.original)}</div>
          </div>
          <div class="sentence-tip">${previewTip}</div>
        ` : `
          <div class="sentence-masked sentence-focus-text">${escapeHtml(currentSentence.masked)}</div>
        `}
        ${isRevealStage ? `
          <div class="sentence-reveal">
            <div class="sentence-reveal-label">原文对照</div>
            <div class="sentence-original">${escapeHtml(currentSentence.original)}</div>
          </div>
        ` : !isPreviewStage ? `
          <div class="sentence-tip">${testingTip}</div>
        ` : ''}
      </article>

      <div class="sentence-mode-actions">
        ${isPreviewStage ? `
          <button class="primary-button" type="button" data-action="start-testing">开始测试</button>
          <button class="ghost-button" type="button" data-action="skip-current">跳过这题</button>
        ` : isRevealStage ? `
          <button class="secondary-button" type="button" data-action="reshuffle-current">本题重新随机</button>
          <button class="secondary-button rating-button rating-button-remembered" type="button" data-action="remembered">这题记住了</button>
          <button class="secondary-button rating-button rating-button-forgotten" type="button" data-action="forgotten">这题没记住</button>
          <button class="ghost-button" type="button" data-action="skip-current">跳过这题</button>
        ` : `
          <button class="secondary-button" type="button" data-action="reshuffle-current">本题重新随机</button>
          <button class="primary-button" type="button" data-action="reveal">查看答案</button>
          <button class="ghost-button" type="button" data-action="skip-current">跳过这题</button>
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
      '闯关训练总结',
      `当前关卡：${exercise.challengeStageLabel || '单句关'}`,
      `当前难度：${formatSentenceChallengeLabel(exercise.challengeLevelIndex ?? DEFAULT_OPTIONS.sentenceChallengeIndex)}`,
      `总题数：${progress.total}`,
      `记住了：${progress.remembered}`,
      `没记住：${progress.forgotten}`,
      '',
      '完整原文',
      getReviewText(exercise),
    ];

    const mistakeLines = exercise.sentences
      .map((sentence, index) => ({ sentence, index, rating: session.ratings[index] }))
      .filter((item) => item.rating === 'forgotten')
      .map((item) => `第 ${item.index + 1} 题\n${item.sentence.original}`);

    if (mistakeLines.length) {
      lines.push('', '错题列表', mistakeLines.join('\n\n'));
    }

    return lines.join('\n\n');
  }

  const currentSentence = exercise.sentences[session.currentIndex];
  const lines = [`第 ${session.currentIndex + 1} / ${progress.total} ${exercise.challengeUnitLabel || '题'}`];

  if (session.stage === 'preview') {
    lines.push('原文预览', currentSentence.original);
    return lines.join('\n\n');
  }

  lines.push(currentSentence.masked);

  if (session.stage === 'revealed') {
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
  const hideModeField = document.querySelector('#hideModeField');
  const fixedRatio = document.querySelector('#fixedRatio');
  const hideStyle = document.querySelector('#hideStyle');
  const fixedRatioField = document.querySelector('#fixedRatioField');
  const sentenceChallengeHint = document.querySelector('#sentenceChallengeHint');
  const results = document.querySelector('#results');
  const statusBar = document.querySelector('#statusBar');
  const resultMeta = document.querySelector('#resultMeta');
  const resultTitle = document.querySelector('#resultTitle');
  const toggleAnswerButton = document.querySelector('#toggleAnswerButton');

  let showOriginal = false;
  let lastExercise = null;
  let sentenceSession = null;
  let sentenceChallengeIndex = DEFAULT_OPTIONS.sentenceChallengeIndex;

  const persisted = loadPersistedState();
  if (persisted) {
    sourceText.value = persisted.text || '';
    practiceMode.value = persisted.practiceMode || DEFAULT_OPTIONS.practiceMode;
    const persistedChallengeIndex = Number.isInteger(persisted.sentenceChallengeIndex)
      ? persisted.sentenceChallengeIndex
      : DEFAULT_OPTIONS.sentenceChallengeIndex;
    sentenceChallengeIndex = Math.max(0, Math.min(persistedChallengeIndex, SENTENCE_CHALLENGE_LEVELS.length - 1));
    languageMode.value = persisted.languageMode || DEFAULT_OPTIONS.languageMode;
    hideMode.value = persisted.hideMode || DEFAULT_OPTIONS.hideMode;
    fixedRatio.value = String(persisted.fixedRatio ?? DEFAULT_OPTIONS.fixedRatio);
    hideStyle.value = persisted.hideStyle || DEFAULT_OPTIONS.hideStyle;
  }

  function getOptions() {
    return {
      practiceMode: practiceMode.value,
      sentenceChallengeIndex,
      languageMode: languageMode.value,
      hideMode: hideMode.value,
      fixedRatio: Number(fixedRatio.value),
      hideRange: DEFAULT_OPTIONS.hideRange,
      hideStyle: hideStyle.value,
    };
  }

  function syncFixedRatioVisibility() {
    fixedRatioField.classList.toggle('is-hidden', practiceMode.value === 'sentence' || hideMode.value !== 'fixed');
  }

  function syncPracticeModeUi() {
    const isSentenceMode = practiceMode.value === 'sentence';
    const sentenceTitle = lastExercise?.roundType === 'mistake-retry' ? '错题重练' : '闯关训练';
    resultTitle.textContent = isSentenceMode ? sentenceTitle : '整段练习';
    toggleAnswerButton.classList.toggle('is-hidden', isSentenceMode);
    hideModeField.classList.toggle('is-hidden', isSentenceMode);
    fixedRatioField.classList.toggle('is-hidden', isSentenceMode || hideMode.value !== 'fixed');
    sentenceChallengeHint.classList.toggle('is-hidden', !isSentenceMode);
  }

  function refreshMeta(exercise) {
    if (practiceMode.value === 'sentence') {
      sentenceSession = ensureSentenceSession(exercise, sentenceSession);
      const progress = getSentenceProgress(sentenceSession);
      const stageLabel = exercise.challengeStageLabel || '单句关';
      const roundLabel = exercise.roundType === 'mistake-retry' ? `${stageLabel} · 错题重练` : stageLabel;
      const difficultyLabel = formatSentenceChallengeLabel(exercise.challengeLevelIndex ?? DEFAULT_OPTIONS.sentenceChallengeIndex);
      const unitLabel = exercise.challengeUnitLabel || '题';
      const sectionProgress = getChallengeSectionProgress(exercise);
      const sectionLabel = sectionProgress ? ` · ${sectionProgress.shortLabel}` : '';

      if (!progress.total) {
        resultMeta.textContent = '尚未生成';
        return;
      }

      if (sentenceSession.currentIndex >= progress.total) {
        resultMeta.textContent = `${formatLanguageLabel(exercise.language)} · ${roundLabel}${sectionLabel} · ${difficultyLabel} · ${progress.total} ${unitLabel} · 记住 ${progress.remembered} ${unitLabel} · 待加强 ${progress.forgotten} ${unitLabel}`;
        return;
      }

      resultMeta.textContent = `${formatLanguageLabel(exercise.language)} · ${roundLabel}${sectionLabel} · ${difficultyLabel} · 第 ${sentenceSession.currentIndex + 1}/${progress.total} ${unitLabel} · 已标记 ${progress.completed} ${unitLabel}`;
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

    lastExercise = practiceMode.value === 'sentence'
      ? generateSentenceChallengeExercise(text, getOptions(), sentenceChallengeIndex)
      : generateExercise(text, getOptions());
    sentenceSession = practiceMode.value === 'sentence' ? createSentenceSession(lastExercise) : null;
    renderExercise(lastExercise);
    statusBar.textContent = practiceMode.value === 'sentence'
      ? `${isFinalBossStage(lastExercise) ? '已进入整篇总关，准备冲刺最终挑战。' : `已进入闯关训练，当前关卡 ${lastExercise.challengeStageLabel || '单句关'}，难度 ${formatSentenceChallengeLabel(sentenceChallengeIndex)}。`}`
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
      ? `${isFinalBossStage(lastExercise) ? '已重新开始整篇总关，本轮状态也已重置。' : '已重新开始当前闯关回合，本轮状态也已重置。'}`
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

      const retryExercise = createMistakeRetryExercise(
        lastExercise,
        sentenceSession,
        getSentenceChallengeOptions(getOptions(), sentenceChallengeIndex),
      );
      if (!retryExercise) {
        statusBar.textContent = '这一轮没有“没记住”的内容，暂时不需要错题重练。';
        return;
      }

      lastExercise = retryExercise;
      sentenceSession = createSentenceSession(lastExercise);
      renderExercise(lastExercise);
      statusBar.textContent = `已开始只练错题，本轮共 ${lastExercise.sentences.length} ${lastExercise.challengeUnitLabel || '题'}，当前难度 ${formatSentenceChallengeLabel(sentenceChallengeIndex)}。`;
      return;
    }

    if (actionButton.dataset.action === 'retry-current') {
      lastExercise = regenerateSentenceChallengeExercise(lastExercise, getOptions(), sentenceChallengeIndex);
      sentenceSession = createSentenceSession(lastExercise);
      renderExercise(lastExercise);
      statusBar.textContent = isFinalBossStage(lastExercise)
        ? `已重新开始整篇总关 · ${formatSentenceChallengeLabel(sentenceChallengeIndex)}。`
        : `已重新开始 ${lastExercise.challengeStageLabel || '当前关卡'} · ${formatSentenceChallengeLabel(sentenceChallengeIndex)}。`;
      return;
    }

    if (actionButton.dataset.action === 'jump-difficulty') {
      const targetIndex = Number(actionButton.dataset.level);
      if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= SENTENCE_CHALLENGE_LEVELS.length) {
        return;
      }

      sentenceChallengeIndex = targetIndex;
      saveCurrentControls();

      if (!preprocessText(sourceText.value)) {
        syncPracticeModeUi();
        renderExercise({ sentences: [] });
        statusBar.textContent = `已切换到 ${formatSentenceChallengeLabel(sentenceChallengeIndex)} 难度，输入内容后开始训练。`;
        return;
      }

      if (sentenceSession.currentIndex < progress.total) {
        lastExercise = updatePendingChallengeDifficulty(lastExercise, sentenceSession, getOptions(), sentenceChallengeIndex);
        sentenceSession.stage = 'preview';
        renderExercise(lastExercise);
        statusBar.textContent = isFinalBossStage(lastExercise)
          ? `已把整篇总关切到 ${formatSentenceChallengeLabel(sentenceChallengeIndex)}，当前题和后续题都已更新。`
          : `已把当前题和后续题切到 ${formatSentenceChallengeLabel(sentenceChallengeIndex)}，不需要重开这一轮。`;
        return;
      }

      lastExercise = lastExercise
        ? regenerateSentenceChallengeExercise(lastExercise, getOptions(), sentenceChallengeIndex)
        : generateSentenceChallengeExercise(sourceText.value, getOptions(), sentenceChallengeIndex);
      sentenceSession = createSentenceSession(lastExercise);
      renderExercise(lastExercise);
      statusBar.textContent = isFinalBossStage(lastExercise)
        ? `已切换到 ${formatSentenceChallengeLabel(sentenceChallengeIndex)} 难度，继续冲击整篇总关。`
        : `已切换到 ${formatSentenceChallengeLabel(sentenceChallengeIndex)} 难度。`;
      return;
    }

    if (actionButton.dataset.action === 'skip-current') {
      const currentSentenceNumber = sentenceSession.currentIndex + 1;
      sentenceSession.itemStates[sentenceSession.currentIndex].skipped = true;
      sentenceSession.ratings[sentenceSession.currentIndex] = 'remembered';
      sentenceSession.stage = 'preview';

      if (sentenceSession.currentIndex >= progress.total - 1) {
        sentenceSession.currentIndex = progress.total;
        renderExercise(lastExercise);
        statusBar.textContent = isFinalBossStage(lastExercise)
          ? '已跳过最后一题，并按“记住了”处理。整篇总关已结束，可以查看总结。'
          : '已跳过最后一题，并按“记住了”处理，可以查看本轮总结。';
        return;
      }

      sentenceSession.currentIndex += 1;
      renderExercise(lastExercise);
      statusBar.textContent = `已跳过第 ${currentSentenceNumber} 题，并按“记住了”处理，继续下一题。`;
      return;
    }

    if (actionButton.dataset.action === 'next-stage') {
      if (sentenceSession.currentIndex < progress.total) {
        return;
      }

      const nextExercise = createNextStageChallengeExercise(lastExercise, sentenceSession, getOptions(), sentenceChallengeIndex);
      if (!nextExercise) {
        return;
      }

      lastExercise = nextExercise;
      sentenceSession = createSentenceSession(lastExercise);
      renderExercise(lastExercise);
      statusBar.textContent = isFinalBossStage(lastExercise)
        ? `已进入 ${lastExercise.challengeStageLabel}，先把整篇顺序在脑中串起来，再开始最终测试。`
        : (isReviewStage(lastExercise)
          ? `已进入 ${lastExercise.challengeStageLabel}，这一关会按原顺序完整回顾前面三关，薄弱题会额外再练一次。`
          : `已进入 ${lastExercise.challengeStageLabel}，继续挑战 ${formatSentenceChallengeLabel(sentenceChallengeIndex)}。`);
      return;
    }

    if (sentenceSession.currentIndex >= progress.total) {
      return;
    }

    if (actionButton.dataset.action === 'start-testing') {
      sentenceSession.stage = 'testing';
      renderExercise(lastExercise);
      statusBar.textContent = isFinalBossStage(lastExercise)
        ? '已进入整篇总关测试，可以继续重新随机整篇挖空版本再冲一次。'
        : '已进入当前题测试，可以直接作答，也可以先重新随机这一题。';
      return;
    }

    if (actionButton.dataset.action === 'reshuffle-current') {
      sentenceSession.itemStates[sentenceSession.currentIndex].reshuffles += 1;
      lastExercise = reshuffleCurrentSentence(
        lastExercise,
        sentenceSession,
        getSentenceChallengeOptions(getOptions(), sentenceChallengeIndex),
      );
      sentenceSession.stage = 'testing';
      renderExercise(lastExercise);
      statusBar.textContent = isFinalBossStage(lastExercise)
        ? '整篇总关已重新随机，你可以继续冲刺这一轮整篇挑战。'
        : '当前题已重新随机，你可以继续只练这一题。';
      return;
    }

    if (actionButton.dataset.action === 'reveal') {
      sentenceSession.stage = 'revealed';
      renderExercise(lastExercise);
      statusBar.textContent = isFinalBossStage(lastExercise)
        ? '已显示整篇原文，请判断这一轮是否真的把全文串起来了。'
        : '已显示当前题原文，请标记自己是否真的记住。';
      return;
    }

    if (sentenceSession.stage !== 'revealed') {
      return;
    }

    if (!['remembered', 'forgotten'].includes(actionButton.dataset.action)) {
      return;
    }

    const currentSentenceNumber = sentenceSession.currentIndex + 1;
    sentenceSession.ratings[sentenceSession.currentIndex] = actionButton.dataset.action;
    sentenceSession.stage = 'preview';

    if (sentenceSession.currentIndex >= progress.total - 1) {
      sentenceSession.currentIndex = progress.total;
      renderExercise(lastExercise);
      statusBar.textContent = lastExercise.roundType === 'mistake-retry'
        ? '本轮错题重练已完成，可以继续回看整篇原文和剩余错题。'
        : `${isFinalBossStage(lastExercise) ? '整篇总关这一轮已完成，可以查看最终总结和建议。' : `本轮 ${lastExercise.challengeStageLabel || '闯关训练'} 已完成，可以继续查看总结建议。`}`;
      return;
    }

    sentenceSession.currentIndex += 1;
    renderExercise(lastExercise);
    statusBar.textContent = actionButton.dataset.action === 'remembered'
      ? `已标记第 ${currentSentenceNumber} 题为“记住了”，继续下一题。`
      : `已标记第 ${currentSentenceNumber} 题为“没记住”，继续下一题。`;
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
      if (practiceMode.value === 'sentence') {
        lastExercise = generateSentenceChallengeExercise(sourceText.value, getOptions(), sentenceChallengeIndex);
        sentenceSession = createSentenceSession(lastExercise);
      } else {
        lastExercise = generateExercise(sourceText.value, getOptions());
        sentenceSession = null;
      }

      renderExercise(lastExercise);
      statusBar.textContent = practiceMode.value === 'sentence'
        ? `已切换到闯关训练，当前关卡 ${lastExercise.challengeStageLabel || '单句关'}，难度 ${formatSentenceChallengeLabel(sentenceChallengeIndex)}。`
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
