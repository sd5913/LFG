import { createContext, useCallback, useContext, useEffect } from 'react';
import { sendFrameLanguage } from './game-locale.js';

export const GameLanguage = createContext('zh-CN');

export function useGameText() {
  const language = useContext(GameLanguage);
  return (zh, en) => language === 'en' ? en : zh;
}

export function useFrameLanguage(ref) {
  const language = useContext(GameLanguage);
  const sync = useCallback(() => sendFrameLanguage(ref.current, language), [ref, language]);
  useEffect(sync, [sync]);
  return sync;
}
