export const LANGUAGE_STORAGE_KEY = 'museum-heist-language';
const LANGUAGE_MESSAGE = 'lfg:game-language';

export function normalizeLanguage(language) {
  return language === 'en' ? 'en' : 'zh-CN';
}

export function sendFrameLanguage(frame, language) {
  frame?.contentWindow?.postMessage({ type: LANGUAGE_MESSAGE, language }, window.location.origin);
}

export function createFrameLocale() {
  let requested = new URLSearchParams(window.location.search).get('lang');
  if (requested === null && window.parent !== window) {
    try { requested = window.localStorage.getItem(LANGUAGE_STORAGE_KEY); }
    catch { /* The parent can still send the language once the frame loads. */ }
  }
  let language = normalizeLanguage(requested);
  const t = (zh, en) => language === 'en' ? en : zh;

  function translateElement(element) {
    if (element.dataset.en !== undefined) {
      element.dataset.zh ??= element.textContent;
      element.textContent = t(element.dataset.zh, element.dataset.en);
    }
    for (const [attribute, key] of [['aria-label', 'AriaLabel'], ['alt', 'Alt']]) {
      const english = element.dataset[`en${key}`];
      if (english !== undefined) {
        element.dataset[`zh${key}`] ??= element.getAttribute(attribute);
        element.setAttribute(attribute, t(element.dataset[`zh${key}`], english));
      }
    }
  }

  function applyLanguage(next) {
    language = normalizeLanguage(next);
    document.documentElement.lang = language;
    document.querySelectorAll('[data-en], [data-en-aria-label], [data-en-alt]').forEach(translateElement);
  }

  function setText(id, zh, en = zh) {
    const element = document.getElementById(id);
    if (element.dataset.zh === String(zh) && element.dataset.en === String(en)) return;
    element.dataset.zh = zh;
    element.dataset.en = en;
    element.textContent = t(zh, en);
  }

  applyLanguage(language);
  window.addEventListener('message', (event) => {
    if (event.origin === window.location.origin && event.source === window.parent && event.data?.type === LANGUAGE_MESSAGE) {
      applyLanguage(event.data.language);
    }
  });
  return { t, setText };
}
