import { analyzeHand } from '../../treasure-hand-lock-demo1/src/hand-gestures.js';

export const UNLOCK_STEPS = Object.freeze([
  { id: 'TOGETHER', title: '双掌合拢', hint: '双手腕在胸前靠拢' },
  { id: 'SPREAD', title: '双掌外展', hint: '双手腕向肩膀两侧分开' },
  { id: 'CROSS', title: '手腕交叉', hint: '双手腕在身前交叉成 X' },
]);

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Hand Landmarker confirms actual hands; Pose Landmarker supplies shoulder,
// elbow and wrist positions needed by the user's two-hand reference art.
export function evaluateUnlockGesture(pose, hands, stepId) {
  const handCount = Array.isArray(hands) ? hands.filter(points => analyzeHand(points).valid).length : 0;
  if (!Array.isArray(pose) || pose.length < 17) return { matched: false, handCount, reason: '请将上半身放入画面' };
  const [ls, rs, le, re, lw, rw] = [11, 12, 13, 14, 15, 16].map(i => pose[i]);
  if ([ls, rs, le, re, lw, rw].some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || (p.visibility ?? 1) < .38)) {
    return { matched: false, handCount, reason: '请露出双肩、双肘和双手腕' };
  }
  const width = distance(ls, rs);
  if (width < .08) return { matched: false, handCount, reason: '请离镜头稍远一些' };
  if (handCount < (stepId === 'TOGETHER' ? 1 : 2)) {
    return { matched: false, handCount, reason: '请把双手完整放入画面' };
  }
  const wrists = distance(lw, rw) / width;
  const shoulderY = (ls.y + rs.y) / 2;
  const chestY = shoulderY + width * .62;
  const nearChest = [lw, rw].every(p => Math.abs(p.y - chestY) < width * .72);
  const shoulderHeight = [lw, rw].every(p => Math.abs(p.y - shoulderY) < width * .82);
  let matched = false;
  if (stepId === 'TOGETHER') matched = wrists < .64 && nearChest && le.y > ls.y && re.y > rs.y;
  if (stepId === 'SPREAD') matched = wrists > 1.28 && shoulderHeight && le.y > Math.min(ls.y, lw.y) && re.y > Math.min(rs.y, rw.y);
  if (stepId === 'CROSS') {
    const reversed = (lw.x - rw.x) * (ls.x - rs.x) < 0;
    const overlap = Math.abs(lw.x - rw.x) > width * .3;
    matched = reversed && overlap && nearChest;
  }
  return { matched, handCount, reason: matched ? '动作正确，继续保持' : '调整双手位置，对齐左侧示意' };
}
