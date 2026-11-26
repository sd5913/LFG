import { createContext, useCallback, useContext, useEffect } from 'react';
import { DEFAULT_LANGUAGE, sendFrameLanguage } from './game-locale.js';

export const GameLanguage = createContext({ language: DEFAULT_LANGUAGE });

export function useGameLanguage() {
  return useContext(GameLanguage);
}

export function useGameText() {
  const { language } = useGameLanguage();
  return (zh, en) => language === 'en' ? en : zh;
}

export function useFrameLanguage(ref) {
  const { language } = useGameLanguage();
  const sync = useCallback(() => sendFrameLanguage(ref.current, language), [ref, language]);
  useEffect(sync, [sync]);
  return sync;
}
