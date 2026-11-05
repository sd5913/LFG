const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, 'ui');
fs.mkdirSync(dir, { recursive: true });

const p = {
  navy: '#152936', dark: '#0d202c', slate: '#58717d', edge: '#e2cda7', gold: '#c4a16d', cream: '#f1dfbc', coral: '#c78178', coralDark: '#9d5c58', sage: '#a5beb1', mint: '#9acbb5', empty: '#405665'
};
function svg(w, h, body) { return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>\n`; }
function save(name,w,h,body) { fs.writeFileSync(path.join(dir,name),svg(w,h,body)); }
const rect=(x,y,w,h,fill,stroke='',sw=0)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${stroke?`stroke="${stroke}" stroke-width="${sw}"`:''}/>`;

// Rotate and scale this transparent layer with the guard's direction.
save('vision-cone.svg', 320, 220,
  `<path d="M0 106 H12 V98 H24 V90 H36 V82 H48 V74 H60 V66 H72 V58 H84 V50 H96 V42 H108 V34 H120 V26 H132 V18 H144 V10 H156 V2 H316 V218 H156 V210 H144 V202 H132 V194 H120 V186 H108 V178 H96 V170 H84 V162 H72 V154 H60 V146 H48 V138 H36 V130 H24 V122 H12 V114 H0Z" fill="${p.coral}" fill-opacity="0.54" stroke="${p.coralDark}" stroke-width="4"/>`);

save('alarm-icon.svg', 64, 64,
  rect(22,21,20,4,p.coral)+rect(18,25,28,22,p.coral)+rect(13,47,38,5,p.coralDark)+rect(24,27,5,8,p.cream)+rect(10,12,5,8,p.coral)+rect(49,12,5,8,p.coral)+rect(29,3,6,10,p.coral)+rect(2,28,9,5,p.coral)+rect(53,28,9,5,p.coral));
save('treasure-icon.svg', 64, 64,
  rect(5,8,54,48,p.gold)+rect(11,14,42,36,p.navy)+rect(16,19,32,26,p.slate)+`<path d="M16 42 L26 31 L34 36 L43 25 L48 31 V45 H16Z" fill="${p.sage}"/>`+rect(35,22,6,6,p.cream)+rect(0,23,5,18,p.gold)+rect(59,23,5,18,p.gold));
save('meter-frame.svg', 256, 44,
  rect(0,8,256,28,p.edge)+rect(5,13,246,18,p.navy)+[0,1,2,3,4].map(i=>rect(9+i*48,16,43,12,p.empty)).join(''));
save('meter-segment.svg', 43, 12, rect(0,0,43,12,p.coral));
save('route-progress.svg', 290, 36,
  rect(0,14,290,4,p.gold)+rect(0,5,8,22,p.gold)+rect(282,5,8,22,p.gold)+`<path d="M124 7 H151 V14 H160 V30 H115 V14 H124Z" fill="${p.cream}" stroke="${p.dark}" stroke-width="3"/>`);

const frame=(w,h,fill=p.navy,edge=p.edge)=>rect(10,0,w-20,8,edge)+rect(0,10,8,h-20,edge)+rect(w-8,10,8,h-20,edge)+rect(10,h-8,w-20,8,edge)+rect(8,8,w-16,h-16,fill);
save('pose-panel.svg', 480, 440, frame(480,440));
save('camera-frame.svg', 480, 320,
  rect(10,0,460,6,p.slate)+rect(0,10,6,300,p.slate)+rect(474,10,6,300,p.slate)+rect(10,314,460,6,p.slate)+
  rect(18,18,35,6,p.sage)+rect(18,18,6,35,p.sage)+rect(427,18,35,6,p.sage)+rect(456,18,6,35,p.sage)+
  rect(18,296,35,6,p.sage)+rect(18,267,6,35,p.sage)+rect(427,296,35,6,p.sage)+rect(456,267,6,35,p.sage));
save('warning-banner.svg', 1000, 84, frame(1000,84,p.coralDark,p.edge));
save('progress-frame.svg', 400, 32, rect(0,0,400,32,p.edge)+rect(5,5,390,22,p.empty));
save('progress-fill.svg', 390, 22, rect(0,0,390,22,p.mint));
save('button-primary.svg', 320, 64, frame(320,64,p.gold,p.cream));
save('button-secondary.svg', 320, 64, frame(320,64,p.navy,p.slate));
save('camera-permission-icon.svg', 64, 64,
  rect(6,18,40,32,p.edge)+rect(12,24,28,20,p.navy)+rect(20,28,12,12,p.slate)+rect(46,25,12,18,p.edge)+rect(27,11,14,7,p.edge));
save('lock-icon.svg', 64, 64,
  rect(15,26,34,28,p.gold)+rect(20,31,24,18,p.navy)+rect(22,12,6,18,p.edge)+rect(36,12,6,18,p.edge)+rect(28,8,8,6,p.edge)+rect(29,35,6,9,p.gold));
save('success-icon.svg', 64, 64,
  rect(5,5,54,54,p.mint)+rect(11,11,42,42,p.navy)+`<path d="M17 32 H23 V38 H29 V44 H35 V38 H41 V32 H47 V26 H41 V32 H35 V38 H29 V32 H23 V26 H17Z" fill="${p.mint}"/>`);
save('failure-icon.svg', 64, 64,
  rect(5,5,54,54,p.coral)+rect(11,11,42,42,p.navy)+rect(25,19,14,22,p.coral)+rect(25,45,14,6,p.coral));
save('pause-icon.svg', 64, 64,
  rect(6,6,52,52,p.edge)+rect(12,12,40,40,p.navy)+rect(21,20,7,24,p.cream)+rect(36,20,7,24,p.cream));
save('retry-icon.svg', 64, 64,
  `<path d="M12 22 H20 V14 H42 V20 H50 V42 H42 V48 H22 V42 H16 V34 H24 V40 H42 V24 H24 V30 H12Z" fill="${p.edge}"/>`);

function pose(arms) {
  let s=rect(73,15,46,46,p.cream)+rect(65,61,62,12,p.cream)+rect(70,73,52,70,p.cream)+rect(77,143,16,37,p.cream)+rect(99,143,16,37,p.cream);
  if(arms==='out') s+=rect(17,77,53,16,p.cream)+rect(122,77,53,16,p.cream);
  if(arms==='right') s+=rect(17,77,53,16,p.cream)+rect(122,31,16,62,p.cream);
  if(arms==='left') s+=rect(54,31,16,62,p.cream)+rect(122,77,53,16,p.cream);
  if(arms==='cross') s+=rect(45,83,102,15,p.cream)+rect(54,98,15,27,p.cream)+rect(123,98,15,27,p.cream);
  return s;
}
for (const [name,arms] of [['pose-arms-out.svg','out'],['pose-right-hand.svg','right'],['pose-left-hand.svg','left'],['pose-cross-arms.svg','cross']]) save(name,192,192,pose(arms));
save('pose-tracking.svg',192,192,
  rect(73,15,46,46,p.sage)+rect(65,61,62,12,p.sage)+rect(70,73,52,70,p.sage)+rect(77,143,16,37,p.sage)+rect(99,143,16,37,p.sage)+rect(17,77,53,16,p.sage)+rect(122,77,53,16,p.sage)+
  [[69,76],[123,76],[17,76],[174,76]].map(([x,y])=>rect(x,y,12,12,p.mint)).join(''));
console.log('Wrote transparent UI SVG parts');
