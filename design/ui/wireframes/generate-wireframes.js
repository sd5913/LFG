const fs = require('node:fs');
const path = require('node:path');

const W = 1280, H = 720;
const C = { bg:'#eef1f2', panel:'#ffffff', ink:'#24333a', muted:'#687b82', line:'#9cabb0', soft:'#dce4e6', teal:'#2f7775', pale:'#d7ece8', amber:'#b47834', danger:'#aa5d50' };
const out = __dirname;
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const R = (x,y,w,h,fill=C.panel,stroke=C.line,r=8,sw=2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const T = (x,y,s,size=20,color=C.ink,weight=400,anchor='start') => `<text x="${x}" y="${y}" fill="${color}" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(s)}</text>`;
const L = (x1,y1,x2,y2,color=C.line,sw=2,dash='') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
const B = (x,y,w,h,label,primary=true) => R(x,y,w,h,primary?C.teal:C.panel,primary?C.teal:C.line,8)+T(x+w/2,y+h/2+7,label,20,primary?'#fff':C.ink,700,'middle');
const tag = (x,y,label,color=C.teal) => R(x,y,132,32,C.panel,color,16,1.5)+T(x+66,y+22,label,15,color,700,'middle');
const panelTitle = (x,y,n,label) => T(x,y,`${n}  ${label}`,23,C.ink,700);
const screen = (num,title,subtitle,body) => `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${C.bg}"/>${R(20,18,1240,684,C.panel,C.soft,14,2)}${R(20,18,1240,72,'#f6f8f8',C.soft,14,2)}${T(48,64,'MUSEUM HEIST  /  页面线框',18,C.teal,700)}${T(1230,64,`0${num} / 07`,18,C.muted,700,'end')}${T(48,129,title,31,C.ink,700)}${T(48,159,subtitle,17,C.muted)}${body}</svg>`;
const note = (x,y,s) => T(x,y,s,16,C.muted);
const cross = (x,y,w,h) => L(x,y,x+w,y+h,C.soft)+L(x+w,y,x,y+h,C.soft);
const display = (x,y,w=115,h=64) => R(x,y,w,h,'#f7f9f9',C.line,4)+L(x+8,y+8,x+w-8,y+h-8,C.soft,2);
const room = (x,y,w,h) => { let s=R(x,y,w,h,'#f7f9f9',C.line,8); s+=display(x+95,y+85)+display(x+280,y+75)+display(x+185,y+225)+display(x+410,y+210); s+=`<circle cx="${x+78}" cy="${y+h-75}" r="19" fill="${C.teal}"/>`+T(x+78,y+h-41,'玩家',14,C.teal,700,'middle'); s+=`<circle cx="${x+w-150}" cy="${y+170}" r="18" fill="${C.danger}"/>`+T(x+w-150,y+214,'保安',14,C.danger,700,'middle'); s+=`<path d="M${x+w-132} ${y+170}L${x+w-34} ${y+95}L${x+w-34} ${y+245}Z" fill="#edd6d1" stroke="${C.danger}" stroke-width="2"/>`; s+=R(x+w-110,y+38,75,55,'#f9f1df',C.amber,4)+T(x+w-72,y+72,'名画',15,C.amber,700,'middle'); return s; };

const pages = [
  ['01-start.svg',screen(1,'开始页','目的：用一句话说明玩法，让玩家开始。',
    R(48,196,760,450,'#f7f9f9',C.line,10)+cross(48,196,760,450)+T(428,404,'夜间展厅 / 怪盗主视觉',25,C.muted,700,'middle')+
    R(838,196,392,450)+T(1034,259,'博物馆大盗',36,C.ink,700,'middle')+T(1034,294,'Museum Heist',20,C.muted,400,'middle')+
    T(1034,351,'键盘移动 · 摆姿势躲避警戒',19,C.ink,400,'middle')+B(884,390,300,62,'开始潜入')+B(884,468,300,50,'玩法说明',false)+
    L(874,542,1194,542,C.soft)+T(886,577,'摄像头与隐私说明',17,C.teal)+T(1182,577,'声音：开',17,C.muted,400,'end')+
    note(48,678,'主要操作只有一个：开始潜入。隐私和声音选项保持可见。'))],
  ['02-camera.svg',screen(2,'摄像头授权与校准','目的：确认镜头可用、上半身完整入镜，再进入游戏。',
    R(48,196,725,428,'#f7f9f9',C.line,10)+T(75,234,'摄像头预览',19,C.ink,700)+R(92,255,637,323,'#e9eeee',C.line,8)+
    R(245,279,327,280,'none',C.teal,12,3)+T(408,415,'上半身取景框',24,C.muted,700,'middle')+tag(104,539,'● 已检测到')+
    R(801,196,429,428)+panelTitle(833,241,'1','授权摄像头')+note(833,274,'浏览器会请求摄像头权限。')+
    panelTitle(833,324,'2','调整位置与光线')+note(833,357,'让头、肩、双臂都进入取景框。')+
    panelTitle(833,407,'3','试做一个姿势')+note(833,440,'举起右手，保持约 2 秒。')+
    B(833,475,365,58,'开始试动作')+T(833,568,'如被拒绝：显示原因和“重试授权”',16,C.danger)+
    note(48,665,'隐私提示：摄像头用于本地姿势判断；最终文案需与实际实现一致。'))],
  ['03-game.svg',screen(3,'游戏主画面','目的：持续看清目标、移动路线、掩体和警戒。',
    R(48,190,1182,65,'#f6f8f8',C.line)+T(70,231,'目标：穿过展柜，接近《夜航图》',22,C.ink,700)+T(995,231,'警戒：注意  33%',20,C.danger,700)+
    room(48,275,875,355)+R(945,275,285,230)+T(967,313,'摄像头小预览',20,C.ink,700)+R(970,330,235,145,'#e9eeee',C.line)+T(1087,411,'玩家轮廓',17,C.muted,400,'middle')+
    R(945,522,285,108)+T(967,557,'提示',19,C.ink,700)+T(967,588,'躲在展柜后等待扫描',17,C.muted)+
    T(55,670,'WASD / 方向键移动',17,C.muted)+T(1225,670,'暂停 / 设置',17,C.teal,400,'end'))],
  ['04-pose.svg',screen(4,'途中姿势挑战','目的：同时显示目标动作、玩家识别状态和剩余时间。',
    R(48,190,1182,67,'#f6eeee',C.danger)+T(74,232,'扫描灯靠近 · 伪装成雕像',23,C.danger,700)+T(1199,232,'剩余 05 秒',22,C.danger,700,'end')+
    R(48,281,555,331)+T(75,321,'目标动作  02 / 04',18,C.teal,700)+T(75,365,'展开双臂，保持不动',26,C.ink,700)+
    `<circle cx="325" cy="435" r="25" fill="${C.line}"/><path d="M325 462v78m-100-52h200m-100 52-45 43m45-43 45 43" stroke="${C.line}" stroke-width="18" stroke-linecap="round" fill="none"/>`+
    R(625,281,605,331)+T(652,321,'你的姿势 / 摄像头预览',18,C.teal,700)+R(655,341,320,240,'#e9eeee',C.line)+T(815,468,'玩家轮廓',20,C.muted,400,'middle')+
    T(1000,392,'姿势正确',22,C.teal,700)+T(1000,426,'继续保持',18,C.ink)+R(1000,451,190,20,C.soft,C.soft,10)+R(1000,451,118,20,C.teal,C.teal,10)+T(1095,505,'62%',22,C.teal,700,'middle')+
    R(48,635,1182,52,'#f7f9f9',C.line)+T(73,668,'成功：获得短暂安全窗口',17,C.teal)+T(1203,668,'超时 / 不匹配：警戒上升',17,C.danger,400,'end'))],
  ['05-unlock.svg',screen(5,'核心展柜：限时开锁','目的：按顺序完成三个已学动作，始终知道当前进度。',
    R(48,190,1182,66,'#f7f9f9',C.line)+T(74,232,'名画展柜 · 姿势密码',23,C.ink,700)+T(1200,232,'剩余 12 秒',22,C.danger,700,'end')+
    R(48,280,735,326)+T(77,324,'动作顺序',19,C.ink,700)+
    R(77,350,204,174,C.pale,C.teal)+T(179,394,'①',25,C.teal,700,'middle')+T(179,443,'举起右手',22,C.ink,700,'middle')+T(179,487,'当前动作',16,C.teal,700,'middle')+
    R(310,350,204,174,'#f7f9f9',C.line)+T(412,394,'②',25,C.muted,700,'middle')+T(412,443,'展开双臂',22,C.muted,700,'middle')+
    R(543,350,204,174,'#f7f9f9',C.line)+T(645,394,'③',25,C.muted,700,'middle')+T(645,443,'双手交叉',22,C.muted,700,'middle')+
    T(77,567,'保持进度',18,C.ink)+R(187,550,546,22,C.soft,C.soft,11)+R(187,550,232,22,C.teal,C.teal,11)+
    R(807,280,423,326)+T(835,324,'摄像头预览',19,C.ink,700)+R(835,348,367,210,'#e9eeee',C.line)+T(1018,466,'玩家轮廓',19,C.muted,400,'middle')+
    R(48,631,1182,55,'#f7f9f9',C.line)+T(74,667,'完成一个动作 → 锁扣亮起并进入下一个',17,C.teal)+T(1201,667,'超时 → 显示失败原因与重试',17,C.danger,400,'end'))],
  ['06-victory.svg',screen(6,'胜利页','目的：明确完成结果，提供再次试玩。',
    R(48,195,760,448,'#f7f9f9',C.line,10)+R(250,263,356,280,'#fff8e8',C.amber,8,5)+T(428,415,'空画框 / 怪盗离场插画',22,C.amber,700,'middle')+
    R(838,195,392,448)+T(1034,290,'得手！',42,C.teal,700,'middle')+T(1034,337,'《夜航图》已成功取走',21,C.ink,400,'middle')+
    T(1034,402,'本次用时：04:32',20,C.muted,400,'middle')+B(884,456,300,62,'再玩一次')+B(884,536,300,50,'返回开始页',false)+
    note(48,678,'结局反馈可加入音效和画框动画；关键结果仍用文字表达。'))],
  ['07-failure.svg',screen(7,'失败页','目的：解释失败原因，并让玩家快速重试。',
    R(48,195,760,448,'#f7f9f9',C.line,10)+R(174,253,510,314,'#f6e9e6',C.danger,8,3)+T(429,416,'警报灯 / 被发现的场景插画',22,C.danger,700,'middle')+
    R(838,195,392,448)+T(1034,275,'潜入失败',38,C.danger,700,'middle')+T(1034,329,'原因：警戒值已满',21,C.ink,700,'middle')+
    T(1034,371,'下次试着躲在展柜后，',18,C.muted,400,'middle')+T(1034,399,'等扫描灯离开再行动。',18,C.muted,400,'middle')+
    B(884,456,300,62,'重试')+B(884,536,300,50,'返回开始页',false)+
    note(48,678,'失败原因随情境替换：警戒值满 / 被持续锁定 / 开锁超时。'))]
];

for (const [name, svg] of pages) fs.writeFileSync(path.join(out,name),svg,'utf8');
const tiles = pages.map(([name,svg],i) => {
  const x=40+(i%2)*650,y=65+Math.floor(i/2)*400;
  const inner=svg.replace(/^<svg[^>]+>/,'').replace(/<\/svg>$/,'');
  return `<g transform="translate(${x} ${y}) scale(0.4765625)">${inner}</g>${T(x,y-12,`${i+1}. ${['开始','摄像头准备','游戏中','姿势挑战','开锁','胜利','失败'][i]}`,20,C.ink,700)}`;
}).join('');
fs.writeFileSync(path.join(out,'overview.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="1340" height="1670" viewBox="0 0 1340 1670"><rect width="1340" height="1670" fill="${C.bg}"/>${tiles}</svg>`,'utf8');
console.log(`Wrote ${pages.length} wireframes and overview.svg`);
