// ==UserScript==
// @name         Mangabuff Helper
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Autoquiz, autoscroll, automine and reader helpers for mangabuff.ru
// @author       DanexExe
// @match        *://mangabuff.ru/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  const STORAGE_KEY = 'mb_helper_settings_v2';
  const COMMENT_VARIANTS = [
    'Спасибо за главу',
    'Сябки',
    'Спасибо за перевод!',
    'Спасибо за продолжение',
    'Спасибо за труды',
    'Спасибо за выпуск главы',
    'Благодарю за главу!',
    'Спасибо большое!',
    'Сябки!',
    'Спасибо!!',
    'Спасибо за главу ❤',
    'Спасибо за перевод ❤',
    'Огромное спасибо!',
    'Благодарочка!',
    'Спасибо за новую главу!',
    'Спасибо, было круто!',
    'Спасибки ✨'
  ];

  const defaults = {
    autoQuiz: false,
    autoScroll: false,
    autoMine: false,
    scrollStep: 260,
    scrollInterval: 1200,
    chaptersSinceComment: 0,
    chaptersUntilComment: randomCommentGap(),
    lastHandledChapterKey: '',
    lastLikedChapterKey: '',
    lastCommentedChapterKey: ''
  };

  const settings = loadSettings();
  const runtime = {
    autoQuizRunning: false,
    autoQuizTimer: null,
    autoScrollInterval: null,
    autoMineInterval: null,
    bottomHits: 0,
    navigatingToNextChapter: false,
    status: {
      autoQuiz: 'Ожидание',
      autoScroll: 'Ожидание',
      autoMine: 'Ожидание'
    }
  };

  let statusNodes = {};
  let controls = {};

  function randomCommentGap() {
    return Math.random() < 0.5 ? 2 : 4;
  }

  function loadSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return { ...defaults, ...parsed };
    } catch (error) {
      console.warn('[Mangabuff Helper] Failed to parse settings:', error);
      return { ...defaults };
    }
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function getCsrfToken() {
    const metaToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    if (metaToken) {
      return metaToken;
    }

    const cookieToken = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
      ?.split('=')
      ?.slice(1)
      ?.join('=');

    return cookieToken ? decodeURIComponent(cookieToken) : '';
  }

  function request(path, options = {}) {
    const csrfToken = getCsrfToken();
    const headers = new Headers(options.headers || {});
    headers.set('X-Requested-With', 'XMLHttpRequest');

    if (csrfToken) {
      headers.set('X-CSRF-TOKEN', csrfToken);
      headers.set('X-XSRF-TOKEN', csrfToken);
    }

    return fetch(path, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      ...options,
      headers
    });
  }

  async function postJson(path, payload) {
    const response = await request(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*'
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      data = text;
    }

    return { response, data };
  }

  async function postForm(path, payload) {
    const body = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      body.set(key, value ?? '');
    });

    const response = await request(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/plain, */*'
      },
      body: body.toString()
    });

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      data = text;
    }

    return { response, data };
  }

  function setStatus(feature, message) {
    runtime.status[feature] = message;
    if (statusNodes[feature]) {
      statusNodes[feature].textContent = message;
    }
  }

  function updateCheckboxes() {
    if (controls.autoQuiz) controls.autoQuiz.checked = settings.autoQuiz;
    if (controls.autoScroll) controls.autoScroll.checked = settings.autoScroll;
    if (controls.autoMine) controls.autoMine.checked = settings.autoMine;
    if (controls.scrollStep) controls.scrollStep.value = String(settings.scrollStep);
  }

  function isReaderPage() {
    return Boolean(document.querySelector('.reader__footer, .reader-menu__item--like'));
  }

  function isQuizPage() {
    return Boolean(document.querySelector('.quiz__answer-item, .quiz__question, .quiz'));
  }

  function getChapterLikeButton() {
    return document.querySelector('.reader-menu__item--like[data-id][data-type="mangaChapter"], .favourite-send-btn.reader-menu__item--like[data-id]');
  }

  function getCurrentChapterId() {
    return getChapterLikeButton()?.dataset?.id || '';
  }

  function getCurrentChapterKey() {
    const chapterId = getCurrentChapterId();
    return `${location.pathname}::${chapterId}`;
  }

  function getNextChapterLink() {
    const candidates = Array.from(
      document.querySelectorAll('.reader__footer a.button.button--primary, a.button[rel="next"]')
    );

    return candidates.find((link) => {
      const text = (link.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return link.rel === 'next' || text.includes('след');
    }) || null;
  }

  async function likeCurrentChapter() {
    const button = getChapterLikeButton();
    const chapterId = button?.dataset?.id;
    const chapterType = button?.dataset?.type || 'mangaChapter';
    const chapterKey = getCurrentChapterKey();

    if (!button || !chapterId || settings.lastLikedChapterKey === chapterKey) {
      return;
    }

    if (button.classList.contains('active')) {
      settings.lastLikedChapterKey = chapterKey;
      saveSettings();
      return;
    }

    const { response, data } = await postForm('/favourite', {
      type: chapterType,
      id: chapterId
    });

    if (!response.ok) {
      throw new Error(`Не удалось поставить лайк (${response.status})`);
    }

    button.classList.add('active');
    settings.lastLikedChapterKey = chapterKey;
    saveSettings();
    console.debug('[Mangabuff Helper] Chapter liked:', chapterId, data);
  }

  function pickRandomComment() {
    return COMMENT_VARIANTS[Math.floor(Math.random() * COMMENT_VARIANTS.length)];
  }

  async function maybeCommentCurrentChapter() {
    const chapterKey = getCurrentChapterKey();
    const chapterId = getCurrentChapterId();

    if (!chapterId || settings.lastCommentedChapterKey === chapterKey) {
      return false;
    }

    settings.chaptersSinceComment += 1;

    if (settings.chaptersSinceComment < settings.chaptersUntilComment) {
      saveSettings();
      return false;
    }

    const commentText = pickRandomComment();
    const { response, data } = await postForm('/comments', {
      text: commentText,
      commentable_id: chapterId,
      commentable_type: 'mangaChapter',
      parent_id: '',
      gif_image: '',
      is_trade: '0',
      is_raffle: '0'
    });

    if (!response.ok) {
      throw new Error(`Не удалось отправить комментарий (${response.status})`);
    }

    if (data && typeof data === 'object' && data.message) {
      console.warn('[Mangabuff Helper] Comment rejected:', data.message);
      settings.chaptersSinceComment = 0;
      settings.chaptersUntilComment = randomCommentGap();
      settings.lastCommentedChapterKey = chapterKey;
      saveSettings();
      return false;
    }

    settings.chaptersSinceComment = 0;
    settings.chaptersUntilComment = randomCommentGap();
    settings.lastCommentedChapterKey = chapterKey;
    saveSettings();
    console.debug('[Mangabuff Helper] Comment sent:', commentText, data);
    return true;
  }

  async function handleReaderChapterEntry() {
    if (!settings.autoScroll || !isReaderPage()) {
      return;
    }

    const chapterKey = getCurrentChapterKey();
    if (!chapterKey || settings.lastHandledChapterKey === chapterKey) {
      return;
    }

    settings.lastHandledChapterKey = chapterKey;
    saveSettings();

    try {
      await likeCurrentChapter();
    } catch (error) {
      console.warn('[Mangabuff Helper] Like failed:', error);
    }

    try {
      await maybeCommentCurrentChapter();
    } catch (error) {
      console.warn('[Mangabuff Helper] Comment failed:', error);
    }
  }

  function startAutoScroll() {
    if (runtime.autoScrollInterval) {
      return;
    }

    if (!isReaderPage()) {
      setStatus('autoScroll', 'Ожидание страницы главы');
      return;
    }

    runtime.bottomHits = 0;
    runtime.navigatingToNextChapter = false;
    setStatus('autoScroll', 'Прокрутка активна');

    handleReaderChapterEntry();

    runtime.autoScrollInterval = window.setInterval(() => {
      if (!settings.autoScroll) {
        stopAutoScroll();
        return;
      }

      window.scrollBy(0, settings.scrollStep);

      const scrollHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      const isNearBottom = window.innerHeight + window.scrollY >= scrollHeight - 140;

      if (!isNearBottom) {
        runtime.bottomHits = 0;
        return;
      }

      runtime.bottomHits += 1;

      if (runtime.bottomHits < 3 || runtime.navigatingToNextChapter) {
        return;
      }

      const nextChapterLink = getNextChapterLink();
      if (nextChapterLink?.href) {
        runtime.navigatingToNextChapter = true;
        setStatus('autoScroll', 'Переход к следующей главе');
        window.location.href = nextChapterLink.href;
        return;
      }

      settings.autoScroll = false;
      saveSettings();
      updateCheckboxes();
      stopAutoScroll();
      setStatus('autoScroll', 'Следующая глава не найдена, автоскролл выключен');
    }, settings.scrollInterval);
  }

  function stopAutoScroll() {
    if (runtime.autoScrollInterval) {
      clearInterval(runtime.autoScrollInterval);
      runtime.autoScrollInterval = null;
    }
    runtime.bottomHits = 0;
    runtime.navigatingToNextChapter = false;
    if (settings.autoScroll) {
      setStatus('autoScroll', 'Пауза');
    } else {
      setStatus('autoScroll', 'Выключен');
    }
  }

  async function sendMineHit() {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${location.origin}/mine/hit`, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    const csrfToken = getCsrfToken();
    if (csrfToken) {
      xhr.setRequestHeader('X-CSRF-TOKEN', csrfToken);
      xhr.setRequestHeader('X-XSRF-TOKEN', csrfToken);
    }

    return new Promise((resolve, reject) => {
      xhr.onload = () => {
        let data = null;
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch (error) {
          data = xhr.responseText;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ status: xhr.status, data });
          return;
        }

        reject(new Error(`mine/hit returned ${xhr.status}`));
      };

      xhr.onerror = () => reject(new Error('mine/hit request failed'));
      xhr.send();
    });
  }

  function startAutoMine() {
    if (runtime.autoMineInterval) {
      return;
    }

    setStatus('autoMine', 'Отправка ударов');
    runtime.autoMineInterval = window.setInterval(async () => {
      if (!settings.autoMine) {
        stopAutoMine();
        return;
      }

      const toast = document.querySelector('.toast-error .toast-message');
      const isLimitReached = toast && /лимит ударов/i.test(toast.textContent || '');
      if (isLimitReached) {
        settings.autoMine = false;
        saveSettings();
        updateCheckboxes();
        stopAutoMine();
        setStatus('autoMine', 'Лимит ударов исчерпан');
        return;
      }

      try {
        await sendMineHit();
        setStatus('autoMine', 'Удар отправлен');
      } catch (error) {
        console.warn('[Mangabuff Helper] AutoMine failed:', error);
        settings.autoMine = false;
        saveSettings();
        updateCheckboxes();
        stopAutoMine();
        setStatus('autoMine', 'mine/hit вернул ошибку, автодобыча выключена');
      }
    }, 1500);
  }

  function stopAutoMine() {
    if (runtime.autoMineInterval) {
      clearInterval(runtime.autoMineInterval);
      runtime.autoMineInterval = null;
    }
    if (settings.autoMine) {
      setStatus('autoMine', 'Пауза');
    } else {
      setStatus('autoMine', 'Выключен');
    }
  }

  async function runAutoQuizStep(answer) {
    const { response, data } = await postJson('/quiz/answer', { answer });

    if (!response.ok) {
      throw new Error(`quiz/answer returned ${response.status}`);
    }

    if (data?.question?.correct_text) {
      setStatus('autoQuiz', 'Отправляю следующий ответ');
      return window.setTimeout(() => {
        if (settings.autoQuiz) {
          runAutoQuizStep(data.question.correct_text).catch(handleAutoQuizError);
        }
      }, 2000);
    }

    runtime.autoQuizRunning = false;
    setStatus('autoQuiz', 'Квиз завершён');
    scheduleAutoQuizRetry();
    return null;
  }

  function handleAutoQuizError(error) {
    runtime.autoQuizRunning = false;
    console.warn('[Mangabuff Helper] AutoQuiz failed:', error);
    setStatus('autoQuiz', 'Ошибка квиза, повтор позже');
    scheduleAutoQuizRetry();
  }

  function clearAutoQuizTimer() {
    if (runtime.autoQuizTimer) {
      clearTimeout(runtime.autoQuizTimer);
      runtime.autoQuizTimer = null;
    }
  }

  function scheduleAutoQuizRetry() {
    clearAutoQuizTimer();
    if (!settings.autoQuiz || !isQuizPage()) {
      if (settings.autoQuiz && !isQuizPage()) {
        setStatus('autoQuiz', 'Ожидание страницы квиза');
      }
      return;
    }

    runtime.autoQuizTimer = window.setTimeout(() => {
      runtime.autoQuizTimer = null;
      if (settings.autoQuiz) {
        startAutoQuiz();
      }
    }, 5000);
  }

  async function startAutoQuiz() {
    if (runtime.autoQuizRunning) {
      return;
    }

    if (!isQuizPage()) {
      setStatus('autoQuiz', 'Ожидание страницы квиза');
      return;
    }

    runtime.autoQuizRunning = true;
    setStatus('autoQuiz', 'Запускаю квиз');

    try {
      const { response, data } = await postJson('/quiz/start', {});

      if (!response.ok) {
        throw new Error(`quiz/start returned ${response.status}`);
      }

      if (!data?.question?.correct_text) {
        runtime.autoQuizRunning = false;
        setStatus('autoQuiz', 'Нет активного вопроса');
        scheduleAutoQuizRetry();
        return;
      }

      setStatus('autoQuiz', 'Первый ответ получен');
      runtime.autoQuizTimer = window.setTimeout(() => {
        runtime.autoQuizTimer = null;
        if (settings.autoQuiz) {
          runAutoQuizStep(data.question.correct_text).catch(handleAutoQuizError);
        }
      }, 2000);
    } catch (error) {
      handleAutoQuizError(error);
    }
  }

  function stopAutoQuiz() {
    runtime.autoQuizRunning = false;
    clearAutoQuizTimer();
    setStatus('autoQuiz', settings.autoQuiz ? 'Пауза' : 'Выключен');
  }

  function createStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .mb-helper-launcher {
        position: fixed;
        left: 20px;
        bottom: 20px;
        z-index: 99998;
        width: 58px;
        height: 58px;
        border: none;
        border-radius: 18px;
        background: linear-gradient(135deg, #ff7a18 0%, #ffb347 100%);
        color: #22140b;
        font-size: 22px;
        font-weight: 800;
        box-shadow: 0 18px 40px rgba(90, 42, 8, 0.26);
        cursor: pointer;
      }

      .mb-helper-panel {
        position: fixed;
        left: 20px;
        bottom: 20px;
        z-index: 99999;
        width: min(360px, calc(100vw - 24px));
        color: #1f2328;
        border-radius: 24px;
        overflow: hidden;
        background:
          radial-gradient(circle at top right, rgba(255, 222, 173, 0.9), transparent 42%),
          linear-gradient(180deg, #fff7eb 0%, #ffffff 100%);
        border: 1px solid rgba(215, 162, 87, 0.35);
        box-shadow: 0 28px 60px rgba(62, 34, 11, 0.22);
        display: none;
        font-family: "Segoe UI", "Trebuchet MS", sans-serif;
      }

      .mb-helper-panel.is-open {
        display: block;
      }

      .mb-helper-header {
        padding: 18px 18px 14px;
        background: linear-gradient(135deg, rgba(255, 174, 66, 0.96), rgba(255, 122, 24, 0.9));
        color: #2f1707;
      }

      .mb-helper-title {
        margin: 0;
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0.02em;
      }

      .mb-helper-subtitle {
        margin: 6px 0 0;
        font-size: 12px;
        opacity: 0.85;
      }

      .mb-helper-close {
        position: absolute;
        top: 12px;
        right: 12px;
        border: none;
        background: rgba(255, 255, 255, 0.28);
        color: #2f1707;
        width: 32px;
        height: 32px;
        border-radius: 10px;
        cursor: pointer;
        font-size: 16px;
      }

      .mb-helper-body {
        padding: 14px;
        display: grid;
        gap: 12px;
      }

      .mb-helper-card {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 12px;
        padding: 14px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(224, 185, 126, 0.4);
      }

      .mb-helper-checkbox {
        width: 18px;
        height: 18px;
        margin-top: 2px;
        accent-color: #ef6b1c;
      }

      .mb-helper-card-title {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
      }

      .mb-helper-card-text {
        margin: 4px 0 0;
        font-size: 12px;
        line-height: 1.45;
        color: #5d5249;
      }

      .mb-helper-status {
        margin-top: 6px;
        font-size: 11px;
        color: #8a4a17;
        font-weight: 600;
      }

      .mb-helper-actions {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
      }

      .mb-helper-secondary {
        border: none;
        border-radius: 14px;
        background: #23160d;
        color: #fff8ef;
        padding: 12px 14px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }

      .mb-helper-note {
        font-size: 11px;
        color: #705f52;
        line-height: 1.45;
      }

      .mb-helper-backdrop {
        position: fixed;
        inset: 0;
        z-index: 100000;
        background: rgba(33, 19, 10, 0.48);
        display: none;
        backdrop-filter: blur(3px);
      }

      .mb-helper-backdrop.is-open {
        display: block;
      }

      .mb-helper-modal {
        position: fixed;
        inset: 50% auto auto 50%;
        transform: translate(-50%, -50%);
        width: min(420px, calc(100vw - 24px));
        z-index: 100001;
        display: none;
        border-radius: 24px;
        background: linear-gradient(180deg, #fffaf3 0%, #ffffff 100%);
        border: 1px solid rgba(225, 181, 119, 0.4);
        box-shadow: 0 32px 70px rgba(37, 20, 8, 0.3);
        overflow: hidden;
        font-family: "Segoe UI", "Trebuchet MS", sans-serif;
      }

      .mb-helper-modal.is-open {
        display: block;
      }

      .mb-helper-modal-head {
        padding: 18px 20px 14px;
        background: linear-gradient(135deg, #23160d, #4a2a12);
        color: #fff7ef;
      }

      .mb-helper-modal-title {
        margin: 0;
        font-size: 18px;
        font-weight: 800;
      }

      .mb-helper-modal-text {
        margin: 6px 0 0;
        font-size: 12px;
        line-height: 1.45;
        color: rgba(255, 247, 239, 0.82);
      }

      .mb-helper-modal-body {
        padding: 18px 20px 20px;
        display: grid;
        gap: 14px;
      }

      .mb-helper-field label {
        display: block;
        margin-bottom: 6px;
        font-size: 12px;
        font-weight: 700;
        color: #352014;
      }

      .mb-helper-field input[type="number"],
      .mb-helper-field input[type="range"] {
        width: 100%;
      }

      .mb-helper-field input[type="number"] {
        box-sizing: border-box;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(152, 95, 35, 0.26);
        background: #fff;
        font-size: 14px;
      }

      .mb-helper-modal-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .mb-helper-button {
        border: none;
        border-radius: 14px;
        padding: 12px 14px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }

      .mb-helper-button--ghost {
        background: #f4e3cf;
        color: #553114;
      }

      .mb-helper-button--primary {
        background: linear-gradient(135deg, #ff7a18, #ffb347);
        color: #2c1707;
      }

      @media (max-width: 640px) {
        .mb-helper-launcher,
        .mb-helper-panel {
          left: 12px;
          bottom: 12px;
        }

        .mb-helper-panel {
          width: calc(100vw - 24px);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createFeatureCard({ title, description, stateKey, statusKey }) {
    const card = document.createElement('label');
    card.className = 'mb-helper-card';

    const checkbox = document.createElement('input');
    checkbox.className = 'mb-helper-checkbox';
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(settings[stateKey]);

    const content = document.createElement('div');
    const titleNode = document.createElement('p');
    titleNode.className = 'mb-helper-card-title';
    titleNode.textContent = title;

    const descriptionNode = document.createElement('p');
    descriptionNode.className = 'mb-helper-card-text';
    descriptionNode.textContent = description;

    const statusNode = document.createElement('div');
    statusNode.className = 'mb-helper-status';
    statusNode.textContent = runtime.status[statusKey];
    statusNodes[statusKey] = statusNode;

    content.appendChild(titleNode);
    content.appendChild(descriptionNode);
    content.appendChild(statusNode);
    card.appendChild(checkbox);
    card.appendChild(content);

    controls[stateKey] = checkbox;

    checkbox.addEventListener('change', () => {
      settings[stateKey] = checkbox.checked;
      saveSettings();

      if (stateKey === 'autoScroll') {
        if (settings.autoScroll) {
          startAutoScroll();
        } else {
          stopAutoScroll();
        }
      }

      if (stateKey === 'autoMine') {
        if (settings.autoMine) {
          startAutoMine();
        } else {
          stopAutoMine();
        }
      }

      if (stateKey === 'autoQuiz') {
        if (settings.autoQuiz) {
          startAutoQuiz();
        } else {
          stopAutoQuiz();
        }
      }
    });

    return card;
  }

  function buildUi() {
    createStyles();

    const launcher = document.createElement('button');
    launcher.className = 'mb-helper-launcher';
    launcher.type = 'button';
    launcher.textContent = 'MB';

    const panel = document.createElement('section');
    panel.className = 'mb-helper-panel';

    const header = document.createElement('div');
    header.className = 'mb-helper-header';

    const title = document.createElement('h2');
    title.className = 'mb-helper-title';
    title.textContent = 'Mangabuff-helper';

    const subtitle = document.createElement('p');
    subtitle.className = 'mb-helper-subtitle';
    subtitle.textContent = 'Единая панель для квиза, чтения глав и автошахты.';

    const closeButton = document.createElement('button');
    closeButton.className = 'mb-helper-close';
    closeButton.type = 'button';
    closeButton.textContent = '✕';

    header.appendChild(title);
    header.appendChild(subtitle);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'mb-helper-body';

    body.appendChild(createFeatureCard({
      title: 'AutoQuiz',
      description: 'Берёт правильный ответ из ответа API квиза и продолжает цепочку, пока вопросы не закончатся.',
      stateKey: 'autoQuiz',
      statusKey: 'autoQuiz'
    }));

    body.appendChild(createFeatureCard({
      title: 'AutoScroll',
      description: 'Прокручивает главы, ставит лайк, иногда пишет комментарий и сам открывает следующую главу до конца тайтла.',
      stateKey: 'autoScroll',
      statusKey: 'autoScroll'
    }));

    body.appendChild(createFeatureCard({
      title: 'AutoMine',
      description: 'Шлёт XHR POST на /mine/hit, а при лимите или ошибке 403 автоматически выключается.',
      stateKey: 'autoMine',
      statusKey: 'autoMine'
    }));

    const actions = document.createElement('div');
    actions.className = 'mb-helper-actions';

    const settingsButton = document.createElement('button');
    settingsButton.className = 'mb-helper-secondary';
    settingsButton.type = 'button';
    settingsButton.textContent = 'Настроить автоскролл';

    const note = document.createElement('div');
    note.className = 'mb-helper-note';
    note.textContent = 'Комментарии отправляются случайно раз в 2 или 4 главы. Если кнопка "След. глава" исчезает, автоскролл выключается сам.';

    actions.appendChild(settingsButton);
    actions.appendChild(note);
    body.appendChild(actions);

    panel.appendChild(header);
    panel.appendChild(body);

    const backdrop = document.createElement('div');
    backdrop.className = 'mb-helper-backdrop';

    const modal = document.createElement('section');
    modal.className = 'mb-helper-modal';

    modal.innerHTML = `
      <div class="mb-helper-modal-head">
        <h3 class="mb-helper-modal-title">Параметры автоскролла</h3>
        <p class="mb-helper-modal-text">Сила прокрутки отвечает за высоту шага за один тик. Чем больше число, тем быстрее страница уходит вниз.</p>
      </div>
      <div class="mb-helper-modal-body">
        <div class="mb-helper-field">
          <label for="mb-scroll-step-range">Сила прокрутки: <span id="mb-scroll-step-value">${settings.scrollStep}</span> px</label>
          <input id="mb-scroll-step-range" type="range" min="80" max="1200" step="20" value="${settings.scrollStep}">
        </div>
        <div class="mb-helper-field">
          <label for="mb-scroll-step-number">Точное значение</label>
          <input id="mb-scroll-step-number" type="number" min="80" max="1200" step="20" value="${settings.scrollStep}">
        </div>
        <div class="mb-helper-field">
          <label for="mb-scroll-interval-number">Интервал между прокрутками (мс)</label>
          <input id="mb-scroll-interval-number" type="number" min="200" max="5000" step="100" value="${settings.scrollInterval}">
        </div>
        <div class="mb-helper-modal-actions">
          <button class="mb-helper-button mb-helper-button--ghost" type="button" id="mb-modal-cancel">Закрыть</button>
          <button class="mb-helper-button mb-helper-button--primary" type="button" id="mb-modal-save">Сохранить</button>
        </div>
      </div>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(panel);
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    const rangeInput = modal.querySelector('#mb-scroll-step-range');
    const numberInput = modal.querySelector('#mb-scroll-step-number');
    const intervalInput = modal.querySelector('#mb-scroll-interval-number');
    const rangeValue = modal.querySelector('#mb-scroll-step-value');
    const saveButton = modal.querySelector('#mb-modal-save');
    const cancelButton = modal.querySelector('#mb-modal-cancel');

    controls.scrollStep = numberInput;

    function syncScrollInputs(value) {
      const safeValue = Number(value) || settings.scrollStep;
      rangeInput.value = String(safeValue);
      numberInput.value = String(safeValue);
      rangeValue.textContent = String(safeValue);
    }

    function openPanel() {
      panel.classList.add('is-open');
      launcher.style.display = 'none';
    }

    function closePanel() {
      panel.classList.remove('is-open');
      launcher.style.display = '';
    }

    function openModal() {
      syncScrollInputs(settings.scrollStep);
      intervalInput.value = String(settings.scrollInterval);
      backdrop.classList.add('is-open');
      modal.classList.add('is-open');
    }

    function closeModal() {
      backdrop.classList.remove('is-open');
      modal.classList.remove('is-open');
    }

    launcher.addEventListener('click', openPanel);
    closeButton.addEventListener('click', closePanel);
    settingsButton.addEventListener('click', openModal);
    backdrop.addEventListener('click', closeModal);
    cancelButton.addEventListener('click', closeModal);

    rangeInput.addEventListener('input', () => syncScrollInputs(rangeInput.value));
    numberInput.addEventListener('input', () => syncScrollInputs(numberInput.value));

    saveButton.addEventListener('click', () => {
      const nextStep = Number(numberInput.value);
      const nextInterval = Number(intervalInput.value);

      if (!Number.isFinite(nextStep) || nextStep < 80 || nextStep > 1200) {
        alert('Сила прокрутки должна быть в диапазоне от 80 до 1200 px.');
        return;
      }

      if (!Number.isFinite(nextInterval) || nextInterval < 200 || nextInterval > 5000) {
        alert('Интервал должен быть в диапазоне от 200 до 5000 мс.');
        return;
      }

      const scrollWasRunning = settings.autoScroll;
      settings.scrollStep = nextStep;
      settings.scrollInterval = nextInterval;
      saveSettings();
      closeModal();

      if (scrollWasRunning) {
        stopAutoScroll();
        startAutoScroll();
      }
    });

    updateCheckboxes();
  }

  function initFromSettings() {
    if (settings.autoScroll) {
      startAutoScroll();
    } else {
      setStatus('autoScroll', 'Выключен');
    }

    if (settings.autoMine) {
      startAutoMine();
    } else {
      setStatus('autoMine', 'Выключен');
    }

    if (settings.autoQuiz) {
      startAutoQuiz();
    } else {
      setStatus('autoQuiz', 'Выключен');
    }
  }

  function init() {
    buildUi();
    initFromSettings();

    if (settings.autoScroll && isReaderPage()) {
      handleReaderChapterEntry();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
