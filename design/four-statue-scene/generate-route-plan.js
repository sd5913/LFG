const fs = require('node:fs');
const path = require('node:path');

const here = __dirname;
const scene = fs.readFileSync(path.join(here, 'planned-scene.png')).toString('base64');
const text = (x, y, value, size = 25, color = '#f6e7c9', anchor = 'start') =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}" font-family="Microsoft YaHei,Noto Sans CJK SC,sans-serif" font-weight="700">${value}</text>`;
const point = (x, y, label, fill, labelX, labelY) =>
  `<circle cx="${x}" cy="${y}" r="17" fill="#102630" stroke="#f6e7c9" stroke-width="5"/><circle cx="${x}" cy="${y}" r="9" fill="${fill}"/>` +
  `<rect x="${labelX}" y="${labelY - 31}" width="170" height="42" rx="6" fill="#102630" fill-opacity=".91" stroke="${fill}" stroke-width="2"/>` +
  text(labelX + 12, labelY - 2, label, 22);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1672" height="1166" viewBox="0 0 1672 1166">
  <defs>
    <marker id="arrow-safe" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto"><path d="M1 1L10 6L1 11Z" fill="#75d7cf"/></marker>
    <marker id="arrow-fast" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto"><path d="M1 1L10 6L1 11Z" fill="#efbc75"/></marker>
    <marker id="arrow-goal" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto"><path d="M1 1L10 6L1 11Z" fill="#f6e7c9"/></marker>
  </defs>
  <rect width="1672" height="1166" fill="#0d2532"/>
  <rect width="1672" height="82" fill="#122c39"/>
  ${text(38, 51, '单场景动线规划 · 四尊姿势雕像', 35)}
  ${text(1634, 51, '左下起点 → 双路汇合 → 宝物', 23, '#a9c4bc', 'end')}
  <g transform="translate(0 82)">
    <image x="0" y="0" width="1672" height="941" xlink:href="data:image/png;base64,${scene}" style="image-rendering:pixelated"/>
    <rect x="0" y="89" width="1672" height="852" fill="#061822" fill-opacity=".16"/>

    <!-- Guard patrol zone: illustrative; actual detection is computed in game code. -->
    <ellipse cx="1130" cy="548" rx="262" ry="126" fill="#ce806e" fill-opacity=".17" stroke="#e99886" stroke-width="5" stroke-dasharray="17 12"/>
    ${text(1228, 600, '守卫巡逻 / 暴露区', 22, '#ffe0c5')}

    <!-- Both playable routes reach the same sculpture C. -->
    <polyline points="240,775 160,680 160,470 400,470 615,470 615,245 830,245 830,475 1015,475" fill="none" stroke="#0c2632" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="240,775 160,680 160,470 400,470 615,470 615,245 830,245 830,475 1015,475" fill="none" stroke="#75d7cf" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arrow-safe)"/>
    <polyline points="240,775 390,775 540,755 720,750 820,750 905,710 855,630 850,535 1015,475" fill="none" stroke="#0c2632" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="240,775 390,775 540,755 720,750 820,750 905,710 855,630 850,535 1015,475" fill="none" stroke="#efbc75" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="23 13" marker-end="url(#arrow-fast)"/>

    <!-- Exit from C after the pose creates a short safe window. -->
    <polyline points="1015,475 1230,465 1290,385 1350,345" fill="none" stroke="#0c2632" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="1015,475 1230,465 1290,385 1350,345" fill="none" stroke="#f6e7c9" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arrow-goal)"/>

    ${point(240, 775, '起点', '#f6e7c9', 296, 792)}
    ${point(400, 470, 'A 护心', '#75d7cf', 324, 535)}
    ${point(540, 755, 'B 持卷', '#efbc75', 438, 817)}
    ${point(905, 710, 'D 搭肩', '#efbc75', 750, 686)}
    ${point(1015, 475, 'C 抚额', '#f6e7c9', 890, 530)}
    ${point(1350, 345, '终点宝物', '#f6e7c9', 1165, 327)}

    <rect x="555" y="556" width="184" height="41" rx="6" fill="#102630" fill-opacity=".9" stroke="#a3c6b9" stroke-width="2"/>
    ${text(568, 585, '中央植物掩体', 20)}
    <rect x="1120" y="770" width="188" height="41" rx="6" fill="#102630" fill-opacity=".9" stroke="#a3c6b9" stroke-width="2"/>
    ${text(1133, 799, 'D 展柜可临时遮挡', 20)}
  </g>

  <rect x="0" y="1023" width="1672" height="143" fill="#0d2532"/>
  <line x1="45" y1="1068" x2="141" y2="1068" stroke="#75d7cf" stroke-width="10"/>
  ${text(158, 1077, '上路：经 A 绕开中央掩体，较稳妥', 23)}
  <line x1="880" y1="1068" x2="976" y2="1068" stroke="#efbc75" stroke-width="10" stroke-dasharray="22 12"/>
  ${text(994, 1077, '下路：经 B、D，接近守卫巡逻区', 23)}
  <line x1="45" y1="1122" x2="141" y2="1122" stroke="#f6e7c9" stroke-width="10"/>
  ${text(158, 1131, 'C 成功后利用安全窗口前往终点', 23)}
  ${text(1630, 1131, '路线与碰撞范围需在游戏内试玩校准', 20, '#9bb9ba', 'end')}
</svg>`;
fs.writeFileSync(path.join(here, 'route-plan.svg'), svg);
