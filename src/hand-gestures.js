export const GESTURES = Object.freeze({
  NONE: 'NONE', POINT: 'POINT', PINCH: 'PINCH', FIST: 'FIST', OPEN: 'OPEN', UNKNOWN: 'UNKNOWN',
});

// Normalised, deliberately forgiving hand-shape thresholds. They keep the
// unlock approachable with webcam depth changes while still separating steps.
export const DEFAULT_THRESHOLDS = Object.freeze({
  pinch: 0.46, pinchIndex: 1.0, pointExtend: 1.4, otherCurl: 1.8, fistCurl: 1.8, fistIndex: 1.3,
});

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const fingerRatio = (points, mcp, pip, tip) => distance(points[tip], points[mcp]) / Math.max(distance(points[pip], points[mcp]), 1e-5);

export function analyzeHand(landmarks, thresholds = {}, { aspectRatio = 1, rotating = false } = {}) {
  if (!Array.isArray(landmarks) || landmarks.length < 21 || landmarks.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return { gesture: GESTURES.NONE, angle: null };
  }
  const threshold = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const palmWidth = Math.max(distance(landmarks[5], landmarks[17]), 0.001);
  const pinchDistance = distance(landmarks[4], landmarks[8]) / palmWidth;
  const fingers = {
    index: fingerRatio(landmarks, 5, 6, 8), middle: fingerRatio(landmarks, 9, 10, 12),
    ring: fingerRatio(landmarks, 13, 14, 16), pinky: fingerRatio(landmarks, 17, 18, 20),
  };
  const curledOthers = [fingers.middle, fingers.ring, fingers.pinky].every((value) => value < threshold.otherCurl);
  const isPinch = pinchDistance < threshold.pinch && fingers.index > threshold.pinchIndex;
  const isFist = fingers.index < (rotating ? 1.55 : threshold.fistIndex) && [fingers.middle, fingers.ring, fingers.pinky].every((value) => value < (rotating ? 2 : threshold.fistCurl));
  const isPoint = fingers.index > threshold.pointExtend && curledOthers && pinchDistance >= threshold.pinch;
  const isOpen = [fingers.index, fingers.middle, fingers.ring, fingers.pinky].every((value) => value > 1.65);
  const gesture = rotating && isFist ? GESTURES.FIST : isPinch ? GESTURES.PINCH : isFist ? GESTURES.FIST : isPoint ? GESTURES.POINT : isOpen ? GESTURES.OPEN : GESTURES.UNKNOWN;
  const knuckles = [5, 9, 13, 17].map(index => landmarks[index]);
  const x = (knuckles.reduce((sum, point) => sum + point.x, 0) / 4 - landmarks[0].x) * aspectRatio;
  const y = knuckles.reduce((sum, point) => sum + point.y, 0) / 4 - landmarks[0].y;
  const angle = Math.hypot(x, y) > 0.01 ? Math.atan2(y, x) : null;
  return { gesture, angle };
}

export const HAND_EDGES = Object.freeze([
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
]);
