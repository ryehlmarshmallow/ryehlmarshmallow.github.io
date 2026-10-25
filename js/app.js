/**
 * Chinese Vocabulary & Hanzi Writing Practice
 * Minimalist, Zero-backend Static Web App
 */

// ==========================================
// Global State & Default Settings
// ==========================================
const DEFAULT_SETTINGS = {
  selectedLessons: [1, 2, 3, 4, 5, 6, 7, 8],
  showOutline: false,
  showHint: false,
  autoAdvanceWriting: true,
  quizFormat: 'flashcard', // 'flashcard' | 'multiple-choice'
  speechRate: 0.85,
  autoPlayAudio: false,
  currentQuizMode: 'hanzi-to-meaning', // 'hanzi-to-meaning' | 'pinyin-to-meaning' | 'meaning-to-hanzi'
  audioSource: 'bundled', // 'bundled' (default, native audio files) | 'device' (SpeechSynthesis) | 'online' (Youdao stream)
  hanziFont: 'kaiti', // 'kaiti' (default) | 'wenkai' | 'standard'
  
  // Writing mode & visibility
  writingMode: 'strict', // 'strict' (default) | 'freehand'
  hidePinyin: false,
  hideNghia: false,
  hideHanzi: false
};

const state = {
  allVocab: [],
  activeVocab: [],
  quizQueue: [],
  currentQuizIndex: 0,
  isCardFlipped: false,
  
  // Writing state
  writingVocabIndex: 0,
  writingCharIndex: 0,
  currentWriter: null,
  isOutlineVisible: false,
  
  // Freehand drawing state
  isDrawingFreehand: false,
  freehandStrokeCount: 0,
  freehandVerified: false,
  
  // Temporary visibility peeks
  tempRevealPinyin: false,
  tempRevealNghia: false,
  
  settings: { ...DEFAULT_SETTINGS }
};

// ==========================================
// Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  loadSettings();
  applyHanziFont(state.settings.hanziFont || 'kaiti');
  setupNavigation();
  setupEventListeners();
  setupFreehandCanvas();
  
  try {
    await loadVocabularyData();
    applyLessonFilter();
    setupHeaderQuickSelect();
    setupSettingsUI();
    setupVocabList();
    initQuiz();
    initWritingPractice();
    restoreActiveTab();
    registerServiceWorker();
  } catch (error) {
    console.error('Initialization error:', error);
    showToast('Lỗi tải dữ liệu từ vựng');
  }
});

// ==========================================
// Storage & Settings Management
// ==========================================
function loadSettings() {
  const saved = localStorage.getItem('hsk_app_settings');
  if (saved) {
    try {
      state.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      // Migrate older 'online' setting to 'bundled'
      if (!state.settings.audioSource || state.settings.audioSource === 'online') {
        state.settings.audioSource = 'bundled';
      }
    } catch (e) {
      console.warn('Invalid saved settings, using defaults');
      state.settings = { ...DEFAULT_SETTINGS };
    }
  } else {
    state.settings = { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  localStorage.setItem('hsk_app_settings', JSON.stringify(state.settings));
}

function applyHanziFont(fontKey) {
  const valid = ['kaiti', 'wenkai', 'standard'].includes(fontKey) ? fontKey : 'kaiti';
  state.settings.hanziFont = valid;
  document.documentElement.setAttribute('data-font', valid);
}

// ==========================================
// Vocabulary Data Loader
// ==========================================
async function loadVocabularyData() {
  const response = await fetch('data/vocabulary.json');
  if (!response.ok) {
    throw new Error(`Failed to load vocabulary.json: ${response.status}`);
  }
  state.allVocab = await response.json();
  console.log(`Loaded ${state.allVocab.length} words from vocabulary.json`);
}

function applyLessonFilter() {
  const selected = new Set(state.settings.selectedLessons);
  state.activeVocab = state.allVocab.filter(item => selected.has(item.lesson_num));

  // Update header count
  const countEl = document.getElementById('active-vocab-count');
  if (countEl) countEl.textContent = state.activeVocab.length;

  syncHeaderDropdown();
}

function setupHeaderQuickSelect() {
  const select = document.getElementById('quick-lesson-select');
  if (!select) return;

  select.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === '1-8') {
      state.settings.selectedLessons = [1, 2, 3, 4, 5, 6, 7, 8];
      showToast('Đã chọn Bài 1 - Bài 8');
    } else if (val === 'all') {
      state.settings.selectedLessons = Array.from({ length: 15 }, (_, i) => i + 1);
      showToast('Đã chọn tất cả 15 bài');
    } else if (val === 'custom') {
      return;
    } else {
      const num = parseInt(val, 10);
      if (!isNaN(num)) {
        state.settings.selectedLessons = [num];
        showToast(`Đã chọn chỉ Bài ${num}`);
      }
    }

    saveSettings();
    applyLessonFilter();
    setupSettingsUI();
    initQuiz();
    initWritingPractice();
    renderVocabList();
  });

  syncHeaderDropdown();
}

function syncHeaderDropdown() {
  const select = document.getElementById('quick-lesson-select');
  const customOpt = document.getElementById('opt-custom-lesson');
  if (!select) return;

  const arr = [...state.settings.selectedLessons].sort((a, b) => a - b);
  const arrStr = arr.join(',');

  if (arrStr === '1,2,3,4,5,6,7,8') {
    select.value = '1-8';
    if (customOpt) customOpt.style.display = 'none';
  } else if (arrStr === '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15') {
    select.value = 'all';
    if (customOpt) customOpt.style.display = 'none';
  } else if (arr.length === 1) {
    select.value = String(arr[0]);
    if (customOpt) customOpt.style.display = 'none';
  } else {
    // Custom selection
    if (customOpt) {
      customOpt.style.display = 'block';
      customOpt.textContent = `Tùy chỉnh (${arr.length} bài)...`;
      select.value = 'custom';
    }
  }
}

// ==========================================
// Audio Synthesis (Native Online Stream + Device TTS Fallback)
// ==========================================
let cachedChineseVoice = null;
let activeAudioElement = null;

function getChineseVoice() {
  if (cachedChineseVoice) return cachedChineseVoice;
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const zhVoice = voices.find(v => {
    const lang = (v.lang || '').toLowerCase();
    const name = (v.name || '').toLowerCase();
    return lang.startsWith('zh') || lang.includes('cmn') || name.includes('chinese') || name.includes('mandarin') || name.includes('putonghua');
  });
  if (zhVoice) {
    cachedChineseVoice = zhVoice;
  }
  return cachedChineseVoice;
}

if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedChineseVoice = null;
    getChineseVoice();
  };
}

function playDeviceVoice(text) {
  const zhVoice = getChineseVoice();
  if (zhVoice && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = zhVoice;
    utterance.lang = zhVoice.lang || 'zh-CN';
    utterance.rate = parseFloat(state.settings.speechRate) || 0.85;
    window.speechSynthesis.speak(utterance);
    return true;
  }
  return false;
}

function playOnlineAudio(text) {
  try {
    if (activeAudioElement) {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
    }
    const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&le=zh`;
    activeAudioElement = new Audio(audioUrl);
    activeAudioElement.playbackRate = parseFloat(state.settings.speechRate) || 1.0;
    activeAudioElement.play().catch(err => {
      console.warn('Online audio stream playback failed:', err);
    });
  } catch (e) {
    console.error('Audio playback error:', e);
  }
}

function playAudio(text, wordId) {
  if (!text) return;

  // 1. Device voice requested explicitly (e.g. on iOS / Apple Siri)
  if (state.settings.audioSource === 'device') {
    const played = playDeviceVoice(text);
    if (played) return;
    // If device has no Chinese voice (e.g. Linux PC without Chinese TTS installed),
    // NEVER fallback to default system voice (which causes Vietnamese pronunciation)!
    // Instead proceed to bundled native Chinese audio below.
  }

  // 2. Online stream requested explicitly
  if (state.settings.audioSource === 'online') {
    playOnlineAudio(text);
    return;
  }

  // 3. Default: Bundled crystal-clear native Chinese audio files (offline, 0 latency, 0 CORS)
  let targetId = wordId;
  if (!targetId && state.allVocab) {
    const match = state.allVocab.find(w => w.hanzi === text);
    if (match) targetId = match.id;
  }

  if (targetId) {
    try {
      if (activeAudioElement) {
        activeAudioElement.pause();
        activeAudioElement.currentTime = 0;
      }
      activeAudioElement = new Audio(`data/audio/${targetId}.mp3`);
      activeAudioElement.playbackRate = parseFloat(state.settings.speechRate) || 1.0;
      activeAudioElement.play().catch(err => {
        console.warn('Bundled audio playback failed, trying online stream fallback:', err);
        playOnlineAudio(text);
      });
      return;
    } catch (e) {
      console.error('Bundled audio error:', e);
    }
  }

  // Fallback for single character or unknown phrase
  playOnlineAudio(text);
}

// ==========================================
// UI Tab Navigation & URL Hash Routing
// ==========================================
function setupNavigation() {
  const tabBtns = document.querySelectorAll('.nav-item');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const panel = document.getElementById(targetTab);
      if (panel) {
        panel.classList.add('active');
      }

      // Update URL hash and localStorage without page reload
      const hash = targetTab.replace('tab-', '#');
      if (window.location.hash !== hash) {
        history.replaceState(null, '', hash);
      }
      localStorage.setItem('hsk_active_tab', targetTab);

      if (targetTab === 'tab-writing') {
        loadCharacterForWriting();
      }
    });
  });

  // Listen to browser Back/Forward navigation
  window.addEventListener('popstate', restoreActiveTab);
}

function restoreActiveTab() {
  const hash = window.location.hash;
  const hashToTab = {
    '#quiz': 'tab-quiz',
    '#writing': 'tab-writing',
    '#vocab': 'tab-vocab',
    '#settings': 'tab-settings'
  };

  let targetTab = hashToTab[hash];
  if (!targetTab) {
    targetTab = localStorage.getItem('hsk_active_tab') || 'tab-quiz';
  }
  switchTab(targetTab);
}

function switchTab(tabId) {
  const btn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (btn) btn.click();
}

// ==========================================
// Quiz & Flashcard Engine
// ==========================================
function initQuiz() {
  if (state.activeVocab.length === 0) {
    showEmptyStateQuiz();
    return;
  }
  
  state.quizQueue = shuffleArray([...state.activeVocab]);
  state.currentQuizIndex = 0;
  state.isCardFlipped = false;
  
  renderCurrentQuizQuestion();
}

function renderCurrentQuizQuestion() {
  if (state.quizQueue.length === 0) {
    showEmptyStateQuiz();
    return;
  }

  const currentItem = state.quizQueue[state.currentQuizIndex];
  const total = state.quizQueue.length;
  const currentNum = state.currentQuizIndex + 1;

  document.getElementById('quiz-progress-text').textContent = `Từ ${currentNum} / ${total}`;
  const pct = Math.round((currentNum / total) * 100);
  document.getElementById('quiz-progress-fill').style.width = `${pct}%`;

  const format = state.settings.quizFormat;
  const mode = state.settings.currentQuizMode;

  const flashcardContainer = document.getElementById('flashcard-container');
  const mcContainer = document.getElementById('multiple-choice-container');

  if (format === 'flashcard') {
    flashcardContainer.style.display = 'block';
    mcContainer.style.display = 'none';
    renderFlashcard(currentItem, mode);
  } else {
    flashcardContainer.style.display = 'none';
    mcContainer.style.display = 'block';
    renderMultipleChoice(currentItem, mode);
  }

  if (state.settings.autoPlayAudio && (mode === 'hanzi-to-meaning' || mode === 'pinyin-to-meaning')) {
    playAudio(currentItem.hanzi, currentItem.id);
  }
}

function renderFlashcard(item, mode) {
  state.isCardFlipped = false;
  const promptLabel = document.getElementById('card-prompt-label');
  const promptContent = document.getElementById('card-prompt-content');
  const answerWrapper = document.getElementById('card-answer-wrapper');
  const answerContent = document.getElementById('card-answer-content');
  const exampleContent = document.getElementById('card-example-content');
  const tapHint = document.getElementById('card-tap-hint');
  const actionsUnrevealed = document.getElementById('card-actions-unrevealed');
  const actionsRevealed = document.getElementById('card-actions-revealed');

  answerWrapper.style.display = 'none';
  tapHint.style.display = 'block';
  actionsUnrevealed.style.display = 'flex';
  actionsRevealed.style.display = 'none';

  if (mode === 'hanzi-to-meaning') {
    promptLabel.textContent = 'Hán tự';
    promptContent.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center;">
        <span class="prompt-hanzi">${item.hanzi}</span>
        <button class="btn-speaker" onclick="event.stopPropagation(); playAudio('${item.hanzi}', ${item.id})" title="Phát âm">🔊</button>
      </div>
    `;
    answerContent.innerHTML = `
      <div class="ans-pinyin">${item.pinyin}</div>
      <div class="ans-nghia">${item.nghia}</div>
    `;
  } else if (mode === 'pinyin-to-meaning') {
    promptLabel.textContent = 'Pinyin';
    promptContent.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center;">
        <span class="prompt-pinyin">${item.pinyin}</span>
        <button class="btn-speaker" onclick="event.stopPropagation(); playAudio('${item.hanzi}', ${item.id})" title="Phát âm">🔊</button>
      </div>
    `;
    answerContent.innerHTML = `
      <div class="ans-hanzi">${item.hanzi}</div>
      <div class="ans-nghia">${item.nghia}</div>
    `;
  } else {
    // meaning-to-hanzi
    promptLabel.textContent = 'Nghĩa tiếng Việt';
    promptContent.innerHTML = `
      <div class="prompt-nghia">${item.nghia}</div>
    `;
    answerContent.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center;">
        <span class="ans-hanzi">${item.hanzi}</span>
        <button class="btn-speaker" onclick="event.stopPropagation(); playAudio('${item.hanzi}', ${item.id})" title="Phát âm">🔊</button>
      </div>
      <div class="ans-pinyin">${item.pinyin}</div>
    `;
  }

  if (item.example) {
    exampleContent.textContent = `Ví dụ: ${item.example}`;
    exampleContent.style.display = 'block';
  } else {
    exampleContent.style.display = 'none';
  }
}

function revealFlashcard() {
  if (state.isCardFlipped) return;
  state.isCardFlipped = true;
  document.getElementById('card-answer-wrapper').style.display = 'block';
  document.getElementById('card-tap-hint').style.display = 'none';
  document.getElementById('card-actions-unrevealed').style.display = 'none';
  document.getElementById('card-actions-revealed').style.display = 'flex';
}

function nextQuizCard(wasRemembered) {
  if (!wasRemembered) {
    const missedWord = state.quizQueue[state.currentQuizIndex];
    state.quizQueue.push(missedWord);
  }
  
  state.currentQuizIndex++;
  if (state.currentQuizIndex >= state.quizQueue.length) {
    showToast('Chúc mừng! Bạn đã hoàn thành lượt ôn tập!');
    state.quizQueue = shuffleArray([...state.activeVocab]);
    state.currentQuizIndex = 0;
  }
  renderCurrentQuizQuestion();
}

function renderMultipleChoice(item, mode) {
  const promptLabel = document.getElementById('mc-prompt-label');
  const promptContent = document.getElementById('mc-prompt-content');
  const optionsList = document.getElementById('mc-options-list');
  const nextBtn = document.getElementById('btn-mc-next');

  nextBtn.style.display = 'none';
  optionsList.innerHTML = '';

  let correctAnswer = '';
  let formatOption = (optItem) => '';

  if (mode === 'hanzi-to-meaning') {
    promptLabel.textContent = 'Chọn nghĩa & Pinyin đúng';
    promptContent.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center;">
        <span class="prompt-hanzi" style="font-size: 3rem;">${item.hanzi}</span>
        <button class="btn-speaker" onclick="playAudio('${item.hanzi}', ${item.id})">🔊</button>
      </div>
    `;
    correctAnswer = `${item.pinyin} - ${item.nghia}`;
    formatOption = (it) => `${it.pinyin} - ${it.nghia}`;
  } else if (mode === 'pinyin-to-meaning') {
    promptLabel.textContent = 'Chọn chữ Hán đúng';
    promptContent.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center;">
        <span class="prompt-pinyin">${item.pinyin}</span>
        <button class="btn-speaker" onclick="playAudio('${item.hanzi}', ${item.id})">🔊</button>
      </div>
    `;
    correctAnswer = `${item.hanzi} (${item.nghia})`;
    formatOption = (it) => `${it.hanzi} (${it.nghia})`;
  } else {
    // meaning-to-hanzi
    promptLabel.textContent = 'Chọn chữ Hán & Pinyin đúng';
    promptContent.innerHTML = `
      <div class="prompt-nghia" style="font-size: 1.4rem;">${item.nghia}</div>
    `;
    correctAnswer = `${item.hanzi} (${item.pinyin})`;
    formatOption = (it) => `${it.hanzi} (${item.id === it.id ? item.pinyin : it.pinyin})`;
  }

  const distractors = generateDistractors(item, 3);
  const options = shuffleArray([item, ...distractors]);

  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'mc-btn';
    const optText = formatOption(opt);
    btn.textContent = optText;

    btn.addEventListener('click', () => {
      const allBtns = optionsList.querySelectorAll('.mc-btn');
      allBtns.forEach(b => b.disabled = true);

      if (opt.id === item.id) {
        btn.classList.add('correct');
        showToast('Chính xác! ✓');
      } else {
        btn.classList.add('incorrect');
        allBtns.forEach(b => {
          if (b.textContent === formatOption(item)) {
            b.classList.add('correct');
          }
        });
        showToast('Chưa chính xác!');
        state.quizQueue.push(item);
      }
      nextBtn.style.display = 'block';
    });

    optionsList.appendChild(btn);
  });
}

function generateDistractors(correctItem, count) {
  const pool = state.activeVocab.filter(w => w.id !== correctItem.id);
  const source = pool.length >= count ? pool : state.allVocab.filter(w => w.id !== correctItem.id);
  const shuffled = shuffleArray([...source]);
  return shuffled.slice(0, count);
}

function showEmptyStateQuiz() {
  document.getElementById('flashcard-container').style.display = 'block';
  document.getElementById('multiple-choice-container').style.display = 'none';
  document.getElementById('card-prompt-label').textContent = 'Chưa chọn bài học';
  document.getElementById('card-prompt-content').innerHTML = `
    <div style="padding: 20px 0; color: var(--text-muted);">
      Bạn chưa chọn bài học nào trong thanh chọn hoặc Cài đặt.<br><br>
      <button class="btn btn-primary" onclick="switchTab('tab-settings')">Mở Cài Đặt</button>
    </div>
  `;
  document.getElementById('card-answer-wrapper').style.display = 'none';
  document.getElementById('card-tap-hint').style.display = 'none';
  document.getElementById('card-actions-unrevealed').style.display = 'none';
  document.getElementById('card-actions-revealed').style.display = 'none';
}

// ==========================================
// Writing Practice (Strict HanziWriter + Freehand Canvas)
// ==========================================
function initWritingPractice() {
  if (state.activeVocab.length === 0) return;
  const savedIdx = parseInt(localStorage.getItem('hsk_writing_vocab_idx') || '0', 10);
  state.writingVocabIndex = (!isNaN(savedIdx) && savedIdx >= 0 && savedIdx < state.activeVocab.length) ? savedIdx : 0;
  state.writingCharIndex = 0;
  state.freehandVerified = false;
  updateWritingVisibilityChips();
  updateWritingModeUI();
  loadWordForWriting();
}

function updateWritingModeUI() {
  const isStrict = state.settings.writingMode === 'strict';
  const strictBtn = document.getElementById('btn-mode-strict');
  const freehandBtn = document.getElementById('btn-mode-freehand');
  const freehandCanvas = document.getElementById('freehand-canvas');
  const targetDiv = document.getElementById('character-canvas-target');
  const strictControls = document.getElementById('strict-controls');
  const freehandUnverified = document.getElementById('freehand-controls-unverified');
  const freehandVerified = document.getElementById('freehand-controls-verified');

  if (isStrict) {
    strictBtn.classList.add('active');
    freehandBtn.classList.remove('active');
    freehandCanvas.classList.remove('active');
    targetDiv.style.pointerEvents = 'auto';
    strictControls.style.display = 'flex';
    freehandUnverified.style.display = 'none';
    freehandVerified.style.display = 'none';
  } else {
    strictBtn.classList.remove('active');
    freehandBtn.classList.add('active');
    freehandCanvas.classList.add('active');
    targetDiv.style.pointerEvents = 'none';
    strictControls.style.display = 'none';
    if (state.freehandVerified) {
      freehandUnverified.style.display = 'none';
      freehandVerified.style.display = 'flex';
    } else {
      freehandUnverified.style.display = 'flex';
      freehandVerified.style.display = 'none';
    }
  }
}

function updateWritingVisibilityChips() {
  const pinyinChip = document.getElementById('toggle-hide-pinyin');
  const nghiaChip = document.getElementById('toggle-hide-nghia');
  const hanziChip = document.getElementById('toggle-hide-hanzi');

  if (pinyinChip) {
    pinyinChip.classList.toggle('masked', state.settings.hidePinyin);
    document.getElementById('icon-vis-pinyin').textContent = state.settings.hidePinyin ? '🚫' : '👁️';
  }
  if (nghiaChip) {
    nghiaChip.classList.toggle('masked', state.settings.hideNghia);
    document.getElementById('icon-vis-nghia').textContent = state.settings.hideNghia ? '🚫' : '👁️';
  }
  if (hanziChip) {
    hanziChip.classList.toggle('masked', state.settings.hideHanzi);
    document.getElementById('icon-vis-hanzi').textContent = state.settings.hideHanzi ? '🚫' : '👁️';
  }
}

function loadWordForWriting() {
  if (state.activeVocab.length === 0) return;
  const currentWord = state.activeVocab[state.writingVocabIndex];

  state.tempRevealPinyin = false;
  state.tempRevealNghia = false;
  state.freehandVerified = false; // Always reset verification state when loading a word!
  renderWritingWordHeader(currentWord);

  // Setup character selector pills
  const pillsContainer = document.getElementById('write-char-pills');
  pillsContainer.innerHTML = '';

  const chars = Array.from(currentWord.hanzi).filter(c => c >= '\u4e00' && c <= '\u9fff');
  if (chars.length === 0) return;

  if (state.writingCharIndex >= chars.length) {
    state.writingCharIndex = 0;
  }

  chars.forEach((char, idx) => {
    const pill = document.createElement('button');
    pill.className = `char-pill ${idx === state.writingCharIndex ? 'active' : ''}`;
    
    // Check if Hanzi pill should be masked to avoid peeking
    if (state.settings.hideHanzi) {
      pill.classList.add('masked');
      pill.textContent = `Chữ ${idx + 1}`;
    } else {
      pill.textContent = char;
    }
    pill.title = `Chữ thứ ${idx + 1}`;

    pill.addEventListener('click', () => {
      state.writingCharIndex = idx;
      state.freehandVerified = false;
      updateCharPills();
      loadCharacterForWriting();
    });

    pillsContainer.appendChild(pill);
  });

  loadCharacterForWriting();
}

function renderWritingWordHeader(word) {
  const pinyinContainer = document.getElementById('write-pinyin-container');
  const nghiaContainer = document.getElementById('write-nghia-container');

  // Pinyin
  if (state.settings.hidePinyin && !state.tempRevealPinyin) {
    pinyinContainer.innerHTML = `<span class="masked-placeholder" id="btn-peek-pinyin">•••• Pinyin</span>`;
    document.getElementById('btn-peek-pinyin').addEventListener('click', () => {
      state.tempRevealPinyin = true;
      renderWritingWordHeader(word);
    });
  } else {
    pinyinContainer.innerHTML = `<span class="writing-pinyin" id="write-pinyin">${word.pinyin}</span>`;
  }

  // Nghĩa
  if (state.settings.hideNghia && !state.tempRevealNghia) {
    nghiaContainer.innerHTML = `<span class="masked-placeholder" id="btn-peek-nghia">•••• Nghĩa</span>`;
    document.getElementById('btn-peek-nghia').addEventListener('click', () => {
      state.tempRevealNghia = true;
      renderWritingWordHeader(word);
    });
  } else {
    nghiaContainer.innerHTML = `<div class="writing-nghia" id="write-nghia">${word.nghia}</div>`;
  }

  document.getElementById('write-lesson-tag').textContent = word.lesson;
}

function updateCharPills() {
  const currentWord = state.activeVocab[state.writingVocabIndex];
  if (!currentWord) return;
  const chars = Array.from(currentWord.hanzi).filter(c => c >= '\u4e00' && c <= '\u9fff');

  const pills = document.querySelectorAll('.char-pill');
  pills.forEach((p, idx) => {
    if (idx === state.writingCharIndex) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }

    const isCompleted = p.classList.contains('completed');
    const isVerifiedForThisChar = (idx === state.writingCharIndex && state.freehandVerified);

    if (state.settings.hideHanzi && !isCompleted && !isVerifiedForThisChar) {
      p.classList.add('masked');
      p.textContent = `Chữ ${idx + 1}`;
    } else {
      p.classList.remove('masked');
      p.textContent = chars[idx] || '';
    }
  });
}

function markCurrentPillCompleted() {
  const pills = document.querySelectorAll('.char-pill');
  const currentWord = state.activeVocab[state.writingVocabIndex];
  const chars = Array.from(currentWord.hanzi).filter(c => c >= '\u4e00' && c <= '\u9fff');

  if (pills[state.writingCharIndex]) {
    pills[state.writingCharIndex].classList.add('completed');
    pills[state.writingCharIndex].classList.remove('masked');
    pills[state.writingCharIndex].textContent = chars[state.writingCharIndex] || '';
  }
}

function loadCharacterForWriting() {
  const currentWord = state.activeVocab[state.writingVocabIndex];
  if (!currentWord) return;

  const chars = Array.from(currentWord.hanzi).filter(c => c >= '\u4e00' && c <= '\u9fff');
  const currentChar = chars[state.writingCharIndex] || chars[0];

  const targetDiv = document.getElementById('character-canvas-target');
  targetDiv.innerHTML = '';

  const statusEl = document.getElementById('stroke-feedback');
  statusEl.className = 'stroke-status';

  // Reset freehand canvas
  clearFreehandCanvas();
  state.freehandVerified = false;
  updateWritingModeUI();
  updateCharPills();

  if (state.settings.writingMode === 'strict') {
    statusEl.textContent = `Chạm và viết từng nét chữ "${state.settings.hideHanzi ? 'này' : currentChar}" theo đúng thứ tự`;
  } else {
    statusEl.textContent = `Viết toàn bộ chữ theo trí nhớ, sau đó bấm "Kiểm tra đáp án"`;
  }

  const customCharDataLoader = function(char, onComplete, onFailed) {
    fetch(`data/strokes/${encodeURIComponent(char)}.json`)
      .then(res => {
        if (!res.ok) throw new Error('Local stroke not found');
        return res.json();
      })
      .then(data => onComplete(data))
      .catch(() => {
        fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${encodeURIComponent(char)}.json`)
          .then(res => res.json())
          .then(data => onComplete(data))
          .catch(err => {
            console.error('Failed to load character stroke data:', err);
            if (onFailed) onFailed(err);
          });
      });
  };

  const showOutline = (state.settings.writingMode === 'strict') && state.settings.showOutline;

  // Configure HanziWriter instance
  state.currentWriter = HanziWriter.create(targetDiv, currentChar, {
    width: 240,
    height: 240,
    padding: 18,
    showOutline: showOutline,
    showCharacter: false,
    strokeColor: '#1f2937',
    radicalColor: '#16a34a',
    drawingColor: '#2563eb',
    drawingWidth: 20,
    strokeAnimationSpeed: 1.2,
    delayBetweenStrokes: 120,
    showHintAfterMisses: state.settings.showHint ? 2 : false,
    charDataLoader: customCharDataLoader
  });

  state.isOutlineVisible = state.settings.showOutline;

  // In Strict mode, start HanziWriter interactive quiz
  if (state.settings.writingMode === 'strict') {
    startWriterQuiz(currentChar, chars);
  }
}

function startWriterQuiz(currentChar, allChars) {
  const statusEl = document.getElementById('stroke-feedback');

  state.currentWriter.quiz({
    onCorrectStroke: function(strokeData) {
      statusEl.className = 'stroke-status success';
      if (strokeData.strokesRemaining > 0) {
        statusEl.textContent = `Nét ${strokeData.strokeNum + 1} chính xác! Còn ${strokeData.strokesRemaining} nét.`;
      }
    },
    onMistake: function(strokeData) {
      statusEl.className = 'stroke-status error';
      statusEl.textContent = `Sai nét hoặc sai hướng! Thử lại nét này nhé.`;
    },
    onComplete: function(summary) {
      statusEl.className = 'stroke-status success';
      markCurrentPillCompleted();

      if (summary.totalMistakes === 0) {
        statusEl.textContent = `Xuất sắc! Bạn đã viết hoàn hảo chữ "${currentChar}"!`;
      } else {
        statusEl.textContent = `Hoàn thành chữ "${currentChar}" (sai ${summary.totalMistakes} lần).`;
      }

      if (state.writingCharIndex < allChars.length - 1) {
        if (state.settings.autoAdvanceWriting) {
          setTimeout(() => {
            state.writingCharIndex++;
            updateCharPills();
            loadCharacterForWriting();
          }, 800);
        }
      } else {
        showToast(`Tuyệt vời! Bạn đã hoàn thành từ "${state.activeVocab[state.writingVocabIndex].hanzi}"!`);
      }
    }
  });
}

// ==========================================
// Freehand Canvas Engine (Uninterrupted Drawing)
// ==========================================
function setupFreehandCanvas() {
  const canvas = document.getElementById('freehand-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function getCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY ?? (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  function startDraw(e) {
    if (state.settings.writingMode !== 'freehand') return;
    if (state.freehandVerified) return; // Prevent drawing after checking until retry
    state.isDrawingFreehand = true;
    const pt = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1f2937';
    state.freehandStrokeCount++;
    document.getElementById('stroke-feedback').textContent = `Đang vẽ: ${state.freehandStrokeCount} nét`;
  }

  function drawMove(e) {
    if (!state.isDrawingFreehand) return;
    const pt = getCoords(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  }

  function endDraw() {
    state.isDrawingFreehand = false;
  }

  canvas.addEventListener('pointerdown', startDraw);
  canvas.addEventListener('pointermove', drawMove);
  canvas.addEventListener('pointerup', endDraw);
  canvas.addEventListener('pointercancel', endDraw);
  canvas.addEventListener('pointerleave', endDraw);
}

function clearFreehandCanvas() {
  const canvas = document.getElementById('freehand-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  state.freehandStrokeCount = 0;
  state.freehandVerified = false;
}

function checkFreehandAnswer() {
  if (state.freehandStrokeCount === 0) {
    showToast('Hãy viết chữ lên bảng trước khi kiểm tra');
    return;
  }

  state.freehandVerified = true;
  updateWritingModeUI();

  // Reveal HanziWriter standard character underneath drawing in soft green
  if (state.currentWriter) {
    state.currentWriter.showCharacter();
    state.currentWriter.updateColor('strokeColor', '#16a34a');
  }

  // Reveal character pill if it was masked
  updateCharPills();

  // Check stroke count if available
  const currentWord = state.activeVocab[state.writingVocabIndex];
  const chars = Array.from(currentWord.hanzi).filter(c => c >= '\u4e00' && c <= '\u9fff');
  const currentChar = chars[state.writingCharIndex] || chars[0];

  const statusEl = document.getElementById('stroke-feedback');
  statusEl.className = 'stroke-status success';
  statusEl.textContent = `Bạn đã vẽ ${state.freehandStrokeCount} nét cho chữ "${currentChar}". Hãy so sánh với chữ mẫu chuẩn màu xanh lá!`;
}

// ==========================================
// Vocabulary Explorer List
// ==========================================
function setupVocabList() {
  const filterSelect = document.getElementById('vocab-lesson-filter');
  filterSelect.innerHTML = '<option value="all">Tất cả bài đã chọn</option><option value="all-15">Tất cả bài (Bài 1 - 15)</option>';

  for (let i = 1; i <= 15; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `Bài ${i}`;
    filterSelect.appendChild(opt);
  }

  filterSelect.addEventListener('change', renderVocabList);
  document.getElementById('vocab-search-input').addEventListener('input', renderVocabList);

  renderVocabList();
}

function renderVocabList() {
  const search = document.getElementById('vocab-search-input').value.trim().toLowerCase();
  const filterVal = document.getElementById('vocab-lesson-filter').value;
  const container = document.getElementById('vocab-items-container');
  const counter = document.getElementById('vocab-counter');

  let list = [];
  if (filterVal === 'all-15') {
    list = state.allVocab;
  } else if (filterVal === 'all') {
    list = state.activeVocab;
  } else {
    const lessonNum = parseInt(filterVal, 10);
    list = state.allVocab.filter(w => w.lesson_num === lessonNum);
  }

  if (search) {
    list = list.filter(w => 
      w.hanzi.toLowerCase().includes(search) ||
      w.pinyin.toLowerCase().includes(search) ||
      w.nghia.toLowerCase().includes(search)
    );
  }

  counter.textContent = `Đang hiển thị ${list.length} từ`;
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px; color: var(--text-muted);">
        Không tìm thấy từ vựng phù hợp
      </div>
    `;
    return;
  }

  list.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = 'vocab-item';
    itemEl.innerHTML = `
      <div>
        <div class="vocab-item-main">
          <span class="vocab-hanzi">${item.hanzi}</span>
          <span class="vocab-pinyin">${item.pinyin}</span>
          <button class="btn-speaker" style="width: 28px; height: 28px; font-size: 0.85rem;" onclick="playAudio('${item.hanzi}', ${item.id})">🔊</button>
        </div>
        <div class="vocab-nghia">${item.nghia}</div>
        <span class="vocab-lesson-tag">${item.lesson}</span>
        ${item.example ? `<div style="font-size: 0.8rem; color: #9ca3af; margin-top: 4px;">Ví dụ: ${item.example}</div>` : ''}
      </div>
      <div class="vocab-actions">
        <button class="btn btn-outline btn-sm" title="Luyện viết từ này">✍️ Viết</button>
      </div>
    `;

    const writeBtn = itemEl.querySelector('.vocab-actions button');
    writeBtn.addEventListener('click', () => {
      let idx = state.activeVocab.findIndex(w => w.id === item.id);
      if (idx === -1) {
        state.activeVocab.unshift(item);
        idx = 0;
      }
      state.writingVocabIndex = idx;
      localStorage.setItem('hsk_writing_vocab_idx', state.writingVocabIndex);
      state.writingCharIndex = 0;
      loadWordForWriting();
      switchTab('tab-writing');
    });

    container.appendChild(itemEl);
  });
}

// ==========================================
// Settings UI & Persistence
// ==========================================
function setupSettingsUI() {
  const grid = document.getElementById('lesson-checkbox-grid');
  grid.innerHTML = '';

  for (let i = 1; i <= 15; i++) {
    const label = document.createElement('label');
    label.className = 'lesson-check-label';
    const isChecked = state.settings.selectedLessons.includes(i);
    label.innerHTML = `
      <input type="checkbox" value="${i}" ${isChecked ? 'checked' : ''}>
      Bài ${i}
    `;

    label.querySelector('input').addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      if (e.target.checked) {
        if (!state.settings.selectedLessons.includes(val)) {
          state.settings.selectedLessons.push(val);
        }
      } else {
        state.settings.selectedLessons = state.settings.selectedLessons.filter(n => n !== val);
      }
      saveSettings();
      applyLessonFilter();
      initQuiz();
      initWritingPractice();
      renderVocabList();
    });

    grid.appendChild(label);
  }

  document.getElementById('btn-select-lessons-1-8').addEventListener('click', () => {
    state.settings.selectedLessons = [1, 2, 3, 4, 5, 6, 7, 8];
    saveSettings();
    applyLessonFilter();
    setupSettingsUI();
    initQuiz();
    initWritingPractice();
    renderVocabList();
    showToast('Đã chọn Bài 1 - Bài 8');
  });

  document.getElementById('btn-select-all-lessons').addEventListener('click', () => {
    state.settings.selectedLessons = Array.from({ length: 15 }, (_, i) => i + 1);
    saveSettings();
    applyLessonFilter();
    setupSettingsUI();
    initQuiz();
    initWritingPractice();
    renderVocabList();
    showToast('Đã chọn tất cả 15 bài');
  });

  document.getElementById('btn-clear-lessons').addEventListener('click', () => {
    state.settings.selectedLessons = [];
    saveSettings();
    applyLessonFilter();
    setupSettingsUI();
    initQuiz();
    renderVocabList();
    showToast('Đã bỏ chọn tất cả bài');
  });

  // Toggles and Selects
  const outlineToggle = document.getElementById('setting-show-outline');
  outlineToggle.checked = !!state.settings.showOutline;
  outlineToggle.addEventListener('change', (e) => {
    state.settings.showOutline = e.target.checked;
    saveSettings();
    if (state.currentWriter) {
      if (e.target.checked) state.currentWriter.showOutline();
      else state.currentWriter.hideOutline();
    }
  });

  const hintToggle = document.getElementById('setting-auto-hint');
  hintToggle.checked = !!state.settings.showHint;
  hintToggle.addEventListener('change', (e) => {
    state.settings.showHint = e.target.checked;
    saveSettings();
    loadCharacterForWriting();
  });

  const autoAdvanceToggle = document.getElementById('setting-auto-advance');
  autoAdvanceToggle.checked = !!state.settings.autoAdvanceWriting;
  autoAdvanceToggle.addEventListener('change', (e) => {
    state.settings.autoAdvanceWriting = e.target.checked;
    saveSettings();
  });

  const quizFormatSelect = document.getElementById('setting-quiz-format');
  quizFormatSelect.value = state.settings.quizFormat || 'flashcard';
  quizFormatSelect.addEventListener('change', (e) => {
    state.settings.quizFormat = e.target.value;
    document.getElementById('quiz-type-label').textContent = e.target.value === 'flashcard' ? 'Thẻ nhớ' : 'Trắc nghiệm';
    saveSettings();
    renderCurrentQuizQuestion();
  });
  document.getElementById('quiz-type-label').textContent = state.settings.quizFormat === 'flashcard' ? 'Thẻ nhớ' : 'Trắc nghiệm';

  const fontSelect = document.getElementById('setting-hanzi-font');
  if (fontSelect) {
    fontSelect.value = state.settings.hanziFont || 'kaiti';
    fontSelect.addEventListener('change', (e) => {
      applyHanziFont(e.target.value);
      saveSettings();
      const label = e.target.options[e.target.selectedIndex].text.split('(')[0].trim();
      showToast(`Đã đổi phông chữ sang ${label}`);
    });
  }

  const audioSourceSelect = document.getElementById('setting-audio-source');
  if (audioSourceSelect) {
    audioSourceSelect.value = state.settings.audioSource || 'bundled';
    audioSourceSelect.addEventListener('change', (e) => {
      state.settings.audioSource = e.target.value;
      saveSettings();
      const labels = {
        bundled: 'Đã chọn giọng chuẩn bản xứ tích hợp (khuyên dùng)',
        device: 'Đã chọn giọng máy thiết bị (WebSpeech)',
        online: 'Đã chọn luồng trực tuyến (Youdao)'
      };
      showToast(labels[e.target.value] || 'Đã lưu cài đặt');
    });
  }

  const speechRateSelect = document.getElementById('setting-speech-rate');
  speechRateSelect.value = String(state.settings.speechRate || 0.85);
  speechRateSelect.addEventListener('change', (e) => {
    state.settings.speechRate = parseFloat(e.target.value);
    saveSettings();
  });

  const autoPlayAudioToggle = document.getElementById('setting-autoplay-audio');
  autoPlayAudioToggle.checked = !!state.settings.autoPlayAudio;
  autoPlayAudioToggle.addEventListener('change', (e) => {
    state.settings.autoPlayAudio = e.target.checked;
    saveSettings();
  });

  document.getElementById('btn-reset-all-settings').addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn khôi phục lại cài đặt gốc không?')) {
      localStorage.removeItem('hsk_app_settings');
      state.settings = { ...DEFAULT_SETTINGS };
      applyHanziFont('kaiti');
      applyLessonFilter();
      setupSettingsUI();
      initQuiz();
      initWritingPractice();
      renderVocabList();
      showToast('Đã khôi phục cài đặt gốc');
    }
  });
}

// ==========================================
// Event Listeners Setup
// ==========================================
function setupEventListeners() {
  // 3 Quiz Mode Buttons
  const modeBtns = document.querySelectorAll('.mode-btn[data-mode]');
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.currentQuizMode = btn.getAttribute('data-mode');
      saveSettings();
      renderCurrentQuizQuestion();
    });
  });

  const activeModeBtn = document.querySelector(`.mode-btn[data-mode="${state.settings.currentQuizMode}"]`);
  if (activeModeBtn) {
    modeBtns.forEach(b => b.classList.remove('active'));
    activeModeBtn.classList.add('active');
  }

  // Flashcard Flip & Actions
  const card = document.getElementById('flashcard-card');
  card.addEventListener('click', () => {
    if (!state.isCardFlipped) revealFlashcard();
  });

  document.getElementById('btn-reveal-answer').addEventListener('click', (e) => {
    e.stopPropagation();
    revealFlashcard();
  });

  document.getElementById('btn-card-again').addEventListener('click', (e) => {
    e.stopPropagation();
    nextQuizCard(false);
  });

  document.getElementById('btn-card-good').addEventListener('click', (e) => {
    e.stopPropagation();
    nextQuizCard(true);
  });

  // Shuffle Quiz
  document.getElementById('btn-shuffle-quiz').addEventListener('click', () => {
    state.quizQueue = shuffleArray([...state.activeVocab]);
    state.currentQuizIndex = 0;
    renderCurrentQuizQuestion();
    showToast('Đã trộn ngẫu nhiên danh sách');
  });

  // Multiple Choice Next Button
  document.getElementById('btn-mc-next').addEventListener('click', () => {
    state.currentQuizIndex++;
    if (state.currentQuizIndex >= state.quizQueue.length) {
      showToast('Chúc mừng! Bạn đã hoàn thành lượt trắc nghiệm!');
      state.quizQueue = shuffleArray([...state.activeVocab]);
      state.currentQuizIndex = 0;
    }
    renderCurrentQuizQuestion();
  });

  // Writing Mode Switcher (Strict vs Freehand)
  document.getElementById('btn-mode-strict').addEventListener('click', () => {
    state.settings.writingMode = 'strict';
    saveSettings();
    updateWritingModeUI();
    loadCharacterForWriting();
    showToast('Chế độ: Chấm từng nét (Mặc định)');
  });

  document.getElementById('btn-mode-freehand').addEventListener('click', () => {
    state.settings.writingMode = 'freehand';
    saveSettings();
    updateWritingModeUI();
    loadCharacterForWriting();
    showToast('Chế độ: Viết tự do & Kiểm tra');
  });

  // Visibility Toggles (Pinyin, Nghĩa, Hán Tự)
  document.getElementById('toggle-hide-pinyin').addEventListener('click', () => {
    state.settings.hidePinyin = !state.settings.hidePinyin;
    saveSettings();
    updateWritingVisibilityChips();
    const currentWord = state.activeVocab[state.writingVocabIndex];
    if (currentWord) renderWritingWordHeader(currentWord);
    showToast(state.settings.hidePinyin ? 'Đã ẩn Pinyin' : 'Đã hiện Pinyin');
  });

  document.getElementById('toggle-hide-nghia').addEventListener('click', () => {
    state.settings.hideNghia = !state.settings.hideNghia;
    saveSettings();
    updateWritingVisibilityChips();
    const currentWord = state.activeVocab[state.writingVocabIndex];
    if (currentWord) renderWritingWordHeader(currentWord);
    showToast(state.settings.hideNghia ? 'Đã ẩn Nghĩa' : 'Đã hiện Nghĩa');
  });

  document.getElementById('toggle-hide-hanzi').addEventListener('click', () => {
    state.settings.hideHanzi = !state.settings.hideHanzi;
    saveSettings();
    updateWritingVisibilityChips();
    updateCharPills();
    showToast(state.settings.hideHanzi ? 'Đã ẩn Chữ Hán mẫu' : 'Đã hiện Chữ Hán mẫu');
  });

  // Freehand Canvas Buttons
  document.getElementById('btn-freehand-clear').addEventListener('click', () => {
    clearFreehandCanvas();
    const currentWord = state.activeVocab[state.writingVocabIndex];
    const chars = Array.from(currentWord.hanzi).filter(c => c >= '\u4e00' && c <= '\u9fff');
    const currentChar = chars[state.writingCharIndex] || chars[0];
    document.getElementById('stroke-feedback').textContent = `Viết toàn bộ chữ "${state.settings.hideHanzi ? 'này' : currentChar}" theo trí nhớ, sau đó bấm Kiểm tra`;
    showToast('Đã xóa nét vẽ');
  });

  document.getElementById('btn-freehand-check').addEventListener('click', () => {
    checkFreehandAnswer();
  });

  document.getElementById('btn-freehand-animate').addEventListener('click', () => {
    if (state.currentWriter) {
      state.currentWriter.animateCharacter();
    }
  });

  document.getElementById('btn-freehand-retry').addEventListener('click', () => {
    clearFreehandCanvas();
    state.freehandVerified = false;
    updateCharPills();
    loadCharacterForWriting();
    showToast('Hãy thử viết lại lần nữa!');
  });

  document.getElementById('btn-freehand-pass').addEventListener('click', () => {
    markCurrentPillCompleted();
    const currentWord = state.activeVocab[state.writingVocabIndex];
    const chars = Array.from(currentWord.hanzi).filter(c => c >= '\u4e00' && c <= '\u9fff');

    if (state.writingCharIndex < chars.length - 1) {
      state.writingCharIndex++;
      state.freehandVerified = false;
      updateCharPills();
      loadCharacterForWriting();
    } else {
      showToast(`Tuyệt vời! Bạn đã hoàn thành từ "${currentWord.hanzi}"!`);
      // Advance to next word
      state.writingVocabIndex = (state.writingVocabIndex + 1) % state.activeVocab.length;
      localStorage.setItem('hsk_writing_vocab_idx', state.writingVocabIndex);
      state.writingCharIndex = 0;
      state.freehandVerified = false;
      loadWordForWriting();
    }
  });

  // Strict Mode Controls
  document.getElementById('btn-write-audio').addEventListener('click', () => {
    const currentWord = state.activeVocab[state.writingVocabIndex];
    if (currentWord) playAudio(currentWord.hanzi, currentWord.id);
  });

  document.getElementById('btn-animate-stroke').addEventListener('click', () => {
    if (state.currentWriter) {
      state.currentWriter.animateCharacter();
    }
  });

  document.getElementById('btn-toggle-outline').addEventListener('click', () => {
    if (state.currentWriter) {
      if (state.isOutlineVisible) {
        state.currentWriter.hideOutline();
        state.isOutlineVisible = false;
        showToast('Đã ẩn nét mờ');
      } else {
        state.currentWriter.showOutline();
        state.isOutlineVisible = true;
        showToast('Đã hiện nét mờ');
      }
    }
  });

  document.getElementById('btn-give-hint').addEventListener('click', () => {
    if (state.currentWriter) {
      state.currentWriter.showOutline();
      state.isOutlineVisible = true;
      setTimeout(() => {
        if (!state.settings.showOutline) {
          state.currentWriter.hideOutline();
          state.isOutlineVisible = false;
        }
      }, 1500);
      showToast('Đã nhấp nháy gợi ý');
    }
  });

  document.getElementById('btn-reset-char').addEventListener('click', () => {
    loadCharacterForWriting();
    showToast('Đã làm mới chữ');
  });

  document.getElementById('btn-write-prev').addEventListener('click', () => {
    if (state.activeVocab.length === 0) return;
    state.writingVocabIndex = (state.writingVocabIndex - 1 + state.activeVocab.length) % state.activeVocab.length;
    localStorage.setItem('hsk_writing_vocab_idx', state.writingVocabIndex);
    state.writingCharIndex = 0;
    state.freehandVerified = false;
    loadWordForWriting();
  });

  document.getElementById('btn-write-next').addEventListener('click', () => {
    if (state.activeVocab.length === 0) return;
    state.writingVocabIndex = (state.writingVocabIndex + 1) % state.activeVocab.length;
    localStorage.setItem('hsk_writing_vocab_idx', state.writingVocabIndex);
    state.writingCharIndex = 0;
    state.freehandVerified = false;
    loadWordForWriting();
  });

  document.getElementById('btn-write-random').addEventListener('click', () => {
    if (state.activeVocab.length === 0) return;
    state.writingVocabIndex = Math.floor(Math.random() * state.activeVocab.length);
    localStorage.setItem('hsk_writing_vocab_idx', state.writingVocabIndex);
    state.writingCharIndex = 0;
    state.freehandVerified = false;
    loadWordForWriting();
  });

  // Desktop Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    const activeTabEl = document.querySelector('.tab-panel.active');
    if (!activeTabEl) return;
    const activeTab = activeTabEl.id;

    if (activeTab === 'tab-quiz') {
      if (state.settings.quizFormat === 'flashcard') {
        if (e.code === 'Space') {
          e.preventDefault();
          if (!state.isCardFlipped) revealFlashcard();
          else nextQuizCard(true);
        } else if (e.key === '1' && state.isCardFlipped) {
          nextQuizCard(false);
        } else if (e.key === '2' && state.isCardFlipped) {
          nextQuizCard(true);
        }
      }
    }
  });
}

// ==========================================
// Helper Utilities
// ==========================================
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('PWA ServiceWorker registered:', reg.scope))
      .catch(err => console.log('ServiceWorker registration skipped/failed:', err));
  }
}
