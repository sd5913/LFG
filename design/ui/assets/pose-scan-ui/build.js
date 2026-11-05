const fs=require('node:fs');
const path=require('node:path');
const dir=__dirname;
const c={navy:'#142b39',navy2:'#1e3745',deep:'#0d202c',gold:'#e5c99f',cream:'#f2dfbe',coral:'#b66c65',coralDark:'#92514e',salmon:'#d58c7b',sage:'#a0b9ae',mint:'#8de0bd',empty:'#3e5663',camera:'#263f4c',border:'#809ba0'};
const r=(x,y,w,h,fill)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const pathSvg=(d,fill,extra='')=>`<path d="${d}" fill="${fill}" ${extra}/>`;
const svg=(w,h,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>\n`;
function save(name,w,h,body){fs.writeFileSync(path.join(dir,name),svg(w,h,body),'utf8')}
function frame(w,h,fill,edge=c.gold,t=8){return r(t,0,w-2*t,t,edge)+r(0,t,t,h-2*t,edge)+r(w-t,t,t,h-2*t,edge)+r(t,h-t,w-2*t,t,edge)+r(t,t,w-2*t,h-2*t,fill)}

save('hud-strip.svg',1672,89,r(0,0,1672,85,c.deep)+r(0,85,1672,4,c.border));
save('alarm-siren.svg',78,70,
  r(30,21,20,6,c.salmon)+r(24,27,32,25,c.salmon)+r(17,52,46,7,c.coralDark)+r(35,29,6,13,c.cream)+
  r(37,0,6,13,c.salmon)+r(9,8,7,13,c.salmon)+r(64,8,7,13,c.salmon)+r(0,27,12,6,c.salmon)+r(68,27,10,6,c.salmon));
save('treasure-frame-icon.svg',65,64,
  r(7,9,51,46,c.gold)+r(13,15,39,34,c.deep)+r(18,20,29,24,c.camera)+pathSvg('M18 42 L27 31 L34 36 L42 26 L47 32 V44 H18Z',c.sage)+r(36,23,7,7,c.cream)+r(1,25,6,16,c.gold)+r(58,25,6,16,c.gold));
save('route-line.svg',490,52,
  r(5,23,480,5,c.gold)+r(5,15,5,21,c.gold)+r(480,15,5,21,c.gold)+
  pathSvg('M21 16 H47 V23 H53 V37 H15 V23 H21Z',c.cream)+
  pathSvg('M223 18 H255 V25 H261 V40 H214 V25 H223Z',c.cream)+r(226,27,23,7,c.deep)+r(231,20,14,6,c.deep));
save('route-track.svg',490,52,r(5,23,480,5,c.gold)+r(5,15,5,21,c.gold)+r(480,15,5,21,c.gold));
save('route-museum-icon.svg',48,40,
  pathSvg('M4 16 L24 4 L44 16 V21 H4Z',c.cream)+r(8,22,6,12,c.cream)+r(21,22,6,12,c.cream)+r(34,22,6,12,c.cream)+r(4,34,40,5,c.cream));
save('route-player-marker.svg',48,40,
  pathSvg('M8 14 H38 V20 H44 V34 H4 V20 H8Z',c.cream)+r(10,22,27,7,c.deep)+r(15,13,18,6,c.deep));
save('warning-icon.svg',64,64,
  r(16,5,32,5,c.cream)+r(10,10,44,44,c.cream)+r(16,54,32,5,c.cream)+r(28,18,8,24,c.coralDark)+r(28,46,8,7,c.coralDark));
save('warning-banner.svg',1290,90,frame(1290,90,c.coralDark,c.gold,9));
save('target-panel.svg',578,520,frame(578,520,c.navy,c.gold,9));
save('tracking-panel.svg',644,520,frame(644,520,c.navy,c.gold,9));
save('camera-window.svg',562,298,
  frame(562,298,c.camera,c.border,6)+
  r(35,27,34,7,c.border)+r(35,27,7,34,c.border)+r(493,27,34,7,c.border)+r(520,27,7,34,c.border)+
  r(35,264,34,7,c.border)+r(35,237,7,34,c.border)+r(493,264,34,7,c.border)+r(520,237,7,34,c.border));
save('footer-panel.svg',1260,68,frame(1260,68,c.navy,c.gold,7));
save('target-pose-arms-out.svg',390,325,
  r(163,7,65,68,c.cream)+r(152,75,87,19,c.cream)+r(143,94,104,123,c.cream)+
  r(28,103,115,22,c.cream)+r(247,103,115,22,c.cream)+r(158,217,29,94,c.cream)+r(203,217,29,94,c.cream)+
  r(143,217,44,18,c.cream)+r(203,217,44,18,c.cream));
save('tracking-pose-arms-out.svg',320,260,
  r(132,8,56,56,c.sage)+r(121,64,78,15,c.sage)+r(123,79,74,107,c.sage)+
  r(10,85,113,17,c.sage)+r(197,85,113,17,c.sage)+r(135,186,23,67,c.sage)+r(162,186,23,67,c.sage)+
  [[10,85],[118,70],[190,70],[298,85]].map(([x,y])=>r(x,y,18,18,c.mint)).join(''));

// Each file is a complete transparent replacement frame. Percentages are part of filenames.
function alarmBar(percent){
  let s=frame(250,43,c.gold,c.cream,6)+r(8,9,234,25,c.empty);
  for(let i=0;i<5;i++){
    const part=Math.max(0,Math.min(1,(percent-i*20)/20));
    const x=11+i*46;
    s+=r(x,12,42,19,c.empty);
    if(part>0)s+=r(x,12,Math.round(42*part),19,c.coral);
  }
  return s;
}
for(let n=0;n<=100;n+=10)save(`alarm-${String(n).padStart(3,'0')}.svg`,250,43,alarmBar(n));

function holdBar(percent){
  let s=frame(475,48,c.gold,c.cream,6)+r(9,10,457,28,c.empty);
  // Segments recall the screenshot but allow precise partial progress.
  const fill=Math.round(457*percent/100);
  if(fill>0)s+=r(9,10,fill,28,c.mint);
  for(let i=1;i<8;i++)s+=r(9+i*57,10,4,28,c.deep);
  return s;
}
for(const n of [...new Set([...Array(11)].map((_,i)=>i*10).concat(62))].sort((a,b)=>a-b))save(`hold-${String(n).padStart(3,'0')}.svg`,475,48,holdBar(n));

console.log('Wrote UI parts and progress states');
