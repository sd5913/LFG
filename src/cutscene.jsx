import React from 'react';
import { publicAsset } from './public-asset.js';
import { useGameText } from './use-game-language.js';

export function Cutscene({ file, label, onComplete }) {
  const t = useGameText();

  return <main className="game-shell">
    <section className="stage-shell cutscene-stage" aria-label={t(...label)}>
      <video
        className="cutscene-video"
        src={publicAsset(`cutscenes/${file}`)}
        aria-label={t(...label)}
        autoPlay
        muted
        playsInline
        onEnded={onComplete}
        onError={onComplete}
      />
      <button className="cutscene-skip" type="button" onClick={onComplete}>
        {t('跳过动画', 'Skip cutscene')}
      </button>
    </section>
  </main>;
}
