/**
 * LFG Treasure Unlock - geometry-only hand gesture recognizer.
 * Input: one hand's 21 normalized MediaPipe HandLandmarker points.
 * Output: one of POINT / PINCH / FIST / OPEN / UNKNOWN with diagnostics.
 * No ML is performed in this file: MediaPipe detects landmarks; we classify them.
 */
export const GESTURES = Object.freeze({
  NONE:'NONE', POINT:'POINT', PINCH:'PINCH', FIST:'FIST', OPEN:'OPEN', UNKNOWN:'UNKNOWN'
});
export const DEFAULT_THRESHOLDS = Object.freeze({
  // Slightly forgiving webcam thresholds. Landmark jitter and foreshortening
  // should not force players to hold an unnaturally precise pose.
  pinch:0.46, // thumb-tip <> index-tip distance / palm width
  pinchIndex:1.0, pointExtend:1.4, otherCurl:1.8, fistCurl:1.8, fistIndex:1.3
});
const D = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const ratio = (pts,mcp,pip,tip)=> D(pts[tip],pts[mcp])/Math.max(D(pts[pip],pts[mcp]),1e-5);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function analyzeHand(landmarks, thresholds={}) {
  if(!Array.isArray(landmarks) || landmarks.length<21 || landmarks.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))
    return {gesture:GESTURES.NONE, valid:false, angle:null, metrics:null};
  const t={...DEFAULT_THRESHOLDS,...thresholds};
  const palmWidth=Math.max(D(landmarks[5],landmarks[17]),0.001);
  // Scale-invariant by normalizing the thumb-index distance to palm width.
  const pinchDistance=D(landmarks[4],landmarks[8])/palmWidth;
  const r={index:ratio(landmarks,5,6,8),middle:ratio(landmarks,9,10,12),ring:ratio(landmarks,13,14,16),pinky:ratio(landmarks,17,18,20)};
  const othersCurled = [r.middle,r.ring,r.pinky].every(x=>x<t.otherCurl);
  const isFist = r.index < t.fistIndex && [r.middle,r.ring,r.pinky].every(x=>x<t.fistCurl);
  const isPinch = pinchDistance<t.pinch && r.index>t.pinchIndex; // pinch takes priority when index is partially open
  const isPoint = r.index>t.pointExtend && othersCurled && pinchDistance>=t.pinch;
  const isOpen = [r.index,r.middle,r.ring,r.pinky].every(x=>x>1.65);
  // Angle between index/pinky knuckles: rotation in the IMAGE plane only.
  const angle=Math.atan2(landmarks[17].y-landmarks[5].y,landmarks[17].x-landmarks[5].x);
  let gesture=GESTURES.UNKNOWN;
  if(isPinch) gesture=GESTURES.PINCH;
  else if(isFist) gesture=GESTURES.FIST;
  else if(isPoint) gesture=GESTURES.POINT;
  else if(isOpen) gesture=GESTURES.OPEN;
  return {gesture,valid:true,angle,metrics:{palmWidth,pinchDistance,...r},
    flags:{isPinch,isFist,isPoint,isOpen}, quality:clamp(palmWidth/0.14,0,1)};
}
export const HAND_EDGES = Object.freeze([
  [0,1],[1,2],[2,3],[3,4], [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17]
]);
