/**
 * LFG Anime Seal Unlock V2: rule-based recognition from MediaPipe landmarks.
 * The output is an INTERPRETATION of estimated landmarks, not a built-in anime classifier.
 * Each stage has its own acceptance rule; no cross-stage classification races.
 * Input coordinates are ALWAYS raw (unmirrored) MediaPipe coordinates.
 */

export const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4], [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12], [9,13],[13,14],[14,15],[15,16],
  [13,17],[0,17],[17,18],[18,19],[19,20]
];
const FINGERS = {
  index: [5,6,7,8],middle:[9,10,11,12],ring:[13,14,15,16],pinky:[17,18,19,20]
};
const clamp = (v, lo=0, hi=1) => Math.min(hi, Math.max(lo, v));
const dist = (a,b) => Math.hypot((a.x-b.x),(a.y-b.y),(a.z||0)-(b.z||0));
const dist2 = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const sub = (a,b) => ({x:a.x-b.x,y:a.y-b.y,z:(a.z||0)-(b.z||0)});
const dot = (a,b) => a.x*b.x+a.y*b.y+(a.z||0)*(b.z||0);
function angle(a,b,c) {const u=sub(a,b),v=sub(c,b),l=Math.hypot(u.x,u.y,u.z)*Math.hypot(v.x,v.y,v.z);return l?Math.acos(clamp(dot(u,v)/l,-1,1))*180/Math.PI:0;}
const average = (...points) => ({x:points.reduce((s,p)=>s+p.x,0)/points.length, y:points.reduce((s,p)=>s+p.y,0)/points.length});
const degreesBetween = (a,b) => {let d=Math.abs(Math.atan2(a.y,a.x)-Math.atan2(b.y,b.x))*180/Math.PI;return d>180?360-d:d;};
const segmentCross = (a,b,c,d) => {
  const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  const z1=cross(a,b,c), z2=cross(a,b,d), z3=cross(c,d,a), z4=cross(c,d,b);
  return z1*z2<=0 && z3*z4<=0;
};
const projDistanceToSegment=(p,a,b)=>{const ab={x:b.x-a.x,y:b.y-a.y};const l=ab.x*ab.x+ab.y*ab.y||1;
  const t=clamp(((p.x-a.x)*ab.x+(p.y-a.y)*ab.y)/l);return dist2(p,{x:a.x+ab.x*t,y:a.y+ab.y*t});};

/** Landmarks are 21 normalized image points; optional world is 21 meter-scale 3D points. */
export function describeHand(landmarks, worldLandmarks=null) {
  if (!Array.isArray(landmarks)||landmarks.length<21) return null;
  const xyz = worldLandmarks?.length===21?worldLandmarks:landmarks;
  const palm = Math.max(dist2(landmarks[0],landmarks[9]),dist2(landmarks[5],landmarks[17]),.035);
  const fingers={};
  for (const [name,[mcp,pip,dip,tip]] of Object.entries(FINGERS)) {
    const joint=angle(xyz[mcp],xyz[pip],xyz[dip]);
    const tipDist=dist(xyz[tip],xyz[mcp]) / Math.max(dist(xyz[pip],xyz[mcp]),.0001);
    // Joint angle beats image orientation; depth coordinates add some rotation robustness.
    const straight=joint>153 && tipDist>1.70;
    const curled=joint<145 || tipDist<1.48;
    fingers[name]={joint,tipDist,straight,curled,tip:landmarks[tip],mcp:landmarks[mcp],pip:landmarks[pip]};
  }
  return {pts:landmarks, xyz, palm, fingers, center:average(landmarks[0],landmarks[5],landmarks[9],landmarks[13],landmarks[17])};
}
const make=(checks, extras={})=>{
  const score=checks.reduce((sum,v)=>sum+(v.ok?v.weight:0),0)/checks.reduce((sum,v)=>sum+v.weight,0);
  return {score,accepted:false,checks:checks.map(({label,ok})=>({label,ok})), ...extras};
};
const ck=(label,ok,weight=1)=>({label,ok:!!ok,weight});
const noHands=(need)=>make([ck(need===1?'请将一只手完整放入镜头':'请将双手完整放入镜头',false)]);
const handMatches=(hands,pred)=>hands.map(pred).sort((a,b)=>b.score-a.score)[0];

function kon(hand){
  const {pts,fingers:f,palm}=hand;
  // Fox silhouette: index and little finger are ears; middle+ring create the muzzle.
  // NOT just a generic devil horns sign: the muzzle needs to approach the thumb.
  const muzzleNear = Math.min(dist2(pts[4],pts[12]),dist2(pts[4],pts[16])) / palm;
  const muzzlePair = dist2(pts[12],pts[16]) / palm;
  const earSpan = dist2(pts[8],pts[20]) / palm;
  const r=make([
    ck('食指伸直（左耳）',f.index.straight,1.3),
    ck('小指伸直（右耳）',f.pinky.straight,1.3),
    ck('中指与无名指形成狐狸嘴部',muzzlePair<1.02,1.0),
    ck('拇指靠近狐狸嘴部',muzzleNear<1.30,1.2),
    ck('两只「耳朵」明显张开',earSpan>0.70,0.9)
  ],{debug:{muzzleNear:+muzzleNear.toFixed(2),earSpan:+earSpan.toFixed(2)}});
  r.accepted=r.score>=.79 && f.index.straight && f.pinky.straight && muzzleNear<1.30;
  return r;
}
function gojo(hand){
  const {pts,fingers:f,palm}=hand;
  const hooked=projDistanceToSegment(pts[12],pts[6],pts[8])/palm;
  // Middle fingertip overlaps the elevated portion of the index, not at its base.
  const elevated=dist2(pts[12],pts[8])<dist2(pts[12],pts[5]) * 1.08;
  const indexReady=f.index.straight || (f.index.joint>137 && f.index.tipDist>1.55);
  const middleBend=f.middle.joint<157 && f.middle.joint>70;
  const r=make([
    ck('食指基本伸直',indexReady,1.3),
    ck('中指弯曲，勾住食指',middleBend,1.3),
    ck('中指指尖靠近食指上半段',hooked<0.79 && elevated,1.5),
    ck('无名指收起',f.ring.curled,1),
    ck('小指收起',f.pinky.curled,1)
  ],{debug:{hookDistance:+hooked.toFixed(2),middleAngle:Math.round(f.middle.joint)}});
  r.accepted=r.score>=.77 && indexReady && middleBend && hooked<.79 && elevated && f.ring.curled && f.pinky.curled;
  return r;
}
function shadow(hands) {
  if(hands.length<2) return noHands(2);
  const [a,b]=hands;
  const dA=sub(average(a.pts[8],a.pts[12]),average(a.pts[5],a.pts[9]));
  const dB=sub(average(b.pts[8],b.pts[12]),average(b.pts[5],b.pts[9]));
  const theta=degreesBetween(dA,dB); // 180° is also parallel for this purpose
  const perp=Math.min(theta,180-theta);
  const centerDist=dist2(a.center,b.center)/Math.max(a.palm,b.palm);
  const tipToOther = Math.min(
    projDistanceToSegment(a.pts[8],b.pts[5],b.pts[8]),
    projDistanceToSegment(b.pts[8],a.pts[5],a.pts[8])
  )/Math.max(a.palm,b.palm);
  const fingersOK=[a,b].every(h=>h.fingers.index.straight && h.fingers.middle.straight);
  // Last two fingers often occlude in genuine crossed seals. Require at least two folds in total.
  const folds=[a,b].reduce((total,h)=>total+(h.fingers.ring.curled?1:0)+(h.fingers.pinky.curled?1:0),0);
  const r=make([
    ck('检测到两只手',true,.6),
    ck('双手食指、中指伸出',fingersOK,1.8),
    ck('两组伸指形成十字夹角',perp>52 && perp<=90,1.7),
    ck('两只手靠近，组成同一个结印',centerDist<2.9,1.2),
    ck('其余手指尽量收起',folds>=2, .7),
    ck('两组手指在画面中接近',tipToOther<1.65,.8)
  ],{debug:{angle:Math.round(perp),centerDistance:+centerDist.toFixed(2),tipDistance:+tipToOther.toFixed(2)}});
  r.accepted=r.score>=.76 && fingersOK && perp>52 && perp<=90 && centerDist<2.9 && tipToOther<1.65;
  return r;
}
function thunder(hands,pose) {
  if(!pose || pose.length<17) return make([ck('请露出上半身，让镜头看见双肩、双肘和双腕',false)]);
  const [le,re,lw,rw]=[pose[13],pose[14],pose[15],pose[16]];
  const [ls,rs]=[pose[11],pose[12]];
  if([le,re,lw,rw,ls,rs].some(p=>!p || (p.visibility!==undefined && p.visibility<.43)))
    return make([ck('双肩、双肘或手腕被遮挡，请退后一些',false)]);
  const shoulder=Math.max(dist2(ls,rs),.13);
  const crossed=segmentCross(le,lw,re,rw) || (lw.x-rw.x)*(le.x-re.x)<0;
  const forearmA=sub(lw,le),forearmB=sub(rw,re);
  const sep=Math.min(degreesBetween(forearmA,forearmB),180-degreesBetween(forearmA,forearmB));
  const near=dist2(lw,rw)/shoulder;
  const lifted=(lw.y+rw.y)/2 < (ls.y+rs.y)/2+.19;
  let signHands=0;
  // The pictured pose extends index + little fingers; if hand tracking misses one
  // finger during crossing, do not demand pixel-perfect accuracy.
  for(const h of hands){const f=h.fingers;if(f.index.straight && f.pinky.straight)signHands++;}
  const r=make([
    ck('检测到上半身与双臂',true,.6),
    ck('双臂在胸口前交叉',crossed,1.8),
    ck('前臂呈明显 X 型',sep>30,1.3),
    ck('手腕靠近脸部或胸口',near<1.6 && lifted,1.2),
    ck('至少有一只手伸出食指与小指',signHands>=1,1.1),
    ck('两只手都形成雷电指型',signHands>=2,.8),
  ],{debug:{forearmAngle:Math.round(sep),wristDistance:+near.toFixed(2),signHands}});
  r.accepted=r.score>=.77 && crossed && sep>30 && near<1.6 && lifted && signHands>=1;
  return r;
}
export const STAGES=[
  {id:'KON',name:'狐之契约 · KON',short:'FOX CONTRACT',subtitle:'双耳开，狐吻合。',holdMs:850,needHands:1,instruction:'单手：食指和小指竖起像狐狸耳朵，中指、无名指靠近拇指形成狐狸嘴。不要只摆普通摇滚手势。',fallback:'如果识别不稳定，请保持整个手掌入镜，手指面向镜头，试着让中指与无名指靠近拇指。'},
  {id:'GOJO',name:'无量启封 · VOID',short:'INFINITE VOID',subtitle:'食指立，中指勾。',holdMs:900,needHands:1,instruction:'单手：食指伸起，中指向食指前方勾过并靠近食指上半段，其余手指收起。',fallback:'请让中指指尖明显靠近食指中上部；不必刻意把手旋转 90°。'},
  {id:'SHADOW',name:'影分身 · CROSS',short:'SHADOW CLONE',subtitle:'双手成十，影门现。',holdMs:1050,needHands:2,instruction:'双手各伸出食指和中指，其他手指收起。一组手指横向、一组纵向，在镜头里形成十字。',fallback:'两只手要同时入镜；让两组伸出的手指接近并形成明显的直角。'},
  {id:'THUNDER',name:'雷霆结界 · X',short:'SUPREME THUNDER',subtitle:'交臂成阵，封印解除。',holdMs:1200,needHands:2,needPose:true,instruction:'上半身退后入镜，双前臂在胸前交叉成 X；双手尽量伸出食指和小指。',fallback:'确保镜头看得到肩膀、手肘和手腕；双前臂要真正交叉，而不只是两只手靠近。'},
];
/** hands: array of describeHand(...); pose: MediaPipe normalized pose landmarks or null */
export function evaluateStage(stageId,hands=[],pose=null) {
  const valid=hands.filter(Boolean);
  if(stageId==='KON')return valid.length?handMatches(valid,kon):noHands(1);
  if(stageId==='GOJO')return valid.length?handMatches(valid,gojo):noHands(1);
  if(stageId==='SHADOW')return shadow(valid);
  if(stageId==='THUNDER')return thunder(valid,pose);
  throw new Error('Unknown gesture stage: '+stageId);
}
