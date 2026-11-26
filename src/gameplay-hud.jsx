import { publicAsset } from './public-asset.js';
import { useGameCamera } from './use-game-camera.js';
import { useGameLanguage, useGameText } from './use-game-language.js';

export function GameHudControls({ onPointerUse }) {
  const t = useGameText();
  const { status, toggle } = useGameCamera();
  const { language, chooseLanguage } = useGameLanguage();
  function handle(action) {
    return (event) => {
      action();
      if (event.detail > 0) onPointerUse?.();
    };
  }
  return <div className="game-hud-controls">
    <button className={`hud-camera ${status}`} type="button" onClick={handle(toggle)} disabled={status === 'requesting'}>
      {status === 'ready' ? t('关闭摄像头', 'Turn off camera') : status === 'requesting' ? t('正在开启…', 'Starting…') : status === 'error' ? t('重试摄像头', 'Retry camera') : t('开启摄像头', 'Enable camera')}
    </button>
    <div className="game-language" role="group" aria-label={t('游戏语言', 'Game language')}>
      <button type="button" lang="zh-CN" aria-pressed={language === 'zh-CN'} onClick={handle(() => chooseLanguage('zh-CN'))}>中文</button>
      <button type="button" lang="en" aria-pressed={language === 'en'} onClick={handle(() => chooseLanguage('en'))}>EN</button>
    </div>
    {status === 'error' && <span className="hud-camera-error" role="status">{t('无法开启摄像头，请检查浏览器权限。', 'Camera unavailable. Check browser permissions.')}</span>}
  </div>;
}

export function GameplayHud({ alertLevel = 0, currentRoom, onPointerUse }) {
  const t = useGameText();
  const alertPercent = Math.round(alertLevel);
  return <header className="room-hud gameplay-hud">
    <img className="gameplay-hud-background" src={publicAsset('stealth-ui/top_hud_background.png')} alt="" />
    <div className="gameplay-alert" role="meter" aria-label={t('警戒', 'Alert')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={alertPercent}>
      <img className="gameplay-siren" src={publicAsset('stealth-ui/alarm_siren.png')} alt="" />
      <span className="gameplay-alert-copy" aria-hidden="true">{t('警戒', 'Alert')}<strong>{alertPercent}%</strong></span>
      <div className="gameplay-meter">
        <img src={publicAsset('stealth-ui/alarm_meter_frame.png')} alt="" />
        <img className="gameplay-meter-fill" style={{ clipPath: `inset(0 ${100 - alertLevel}% 0 0)` }} src={publicAsset('stealth-ui/alarm_meter_fill_segments.png')} alt="" />
      </div>
    </div>
    <div className="gameplay-route" role="group" aria-label={t(`潜入路线：当前位置 ${currentRoom}`, `Infiltration route: checkpoint ${currentRoom}`)}>
      {[1, 2, 3].map((room) => <div className={`gameplay-room-node ${room === currentRoom ? 'current' : ''}`} key={room}>
        <img src={publicAsset('stealth-ui/room_house.png')} alt={t(`第 ${room} 个房间`, `Room ${room}`)} />
        {room === currentRoom && <img className="gameplay-player-marker" src={publicAsset('stealth-ui/player_marker.png')} alt={t('小偷当前位置', 'Thief’s location')} />}
      </div>)}
      <img className="gameplay-treasure" src={publicAsset('stealth-ui/treasure_chest.png')} alt={t('最终宝箱', 'Treasure chest')} />
    </div>
    <GameHudControls onPointerUse={onPointerUse} />
  </header>;
}
