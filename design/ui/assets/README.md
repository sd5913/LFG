# Museum Heist 游戏资源包

这套素材按已确认的低饱和像素风制作，供 1672 × 941 的首个展厅原型使用。[打开拼装预览](preview.html)可查看图层效果；WASD / 方向键移动怪盗，按 `P` 查看姿势挑战 UI。[拆分素材画廊](gallery.html)可逐个检查透明底。预览仅演示素材叠放，摄像头姿势识别和完整关卡规则仍需接入游戏代码。

## 文件分层

| 目录 | 用途 | 文件 |
| --- | --- | --- |
| `background/` | 不透明静态展厅；地面、墙、灯、植物、长椅、地毯 | `museum-hall.png` |
| `sprites/` | 独立透明 PNG；人物可移动、展柜可碰撞/掩护、名画可触发终点 | `thief-*.png`、`guard-*.png`、`case-*.png`、`treasure-painting.png` |
| `ui/` | 独立透明 SVG；警戒、距离、视线、姿势挑战及通用按钮/状态图标 | 24 个 SVG 部件 |

角色有右、上、下三个朝向。向左时可将右向素材水平翻转。当前是静态姿态，适合原型移动；逐帧走路动画可在玩法稳定后补充。四个展柜分别保留了花瓶、皇冠、浮雕头像和项链。名画是独立的终点触发物。

## 放置与动态数据

`scene-layout.json` 给出所有对象在原画幅上的目标矩形、展柜碰撞区域、静态障碍以及警戒视线的大致位置。`alpha-bounds.json` 给出每张透明 PNG 的实际内容边界 `[x, y, width, height]`。绘制时从源 PNG 的这个边界取图，再缩放到目标矩形；否则源文件四周的透明留白会让精灵显得过小。`preview.html` 已示范这一绘制方式。

警戒百分比、填充段数、宝物距离、扫描倒计时和姿势保持进度都应由代码计算；SVG 只提供图标、框和填充片。警戒达到 100% 即触发失败。`vision-cone.svg` 是透明视线层，可随保安位置移动并按方向旋转；检测范围需要由游戏逻辑计算，不能只以图片透明区域判定。

## 姿势 UI

`pose-arms-out.svg`、`pose-right-hand.svg`、`pose-left-hand.svg`、`pose-cross-arms.svg` 是四个透明目标动作。`pose-tracking.svg` 是摄像头轮廓的示意图；实际游戏应把 MediaPipe 识别到的关键点映射到它所在的预览区域。`pose-panel.svg`、`camera-frame.svg`、`warning-banner.svg`、`progress-frame.svg`、`progress-fill.svg` 用于拼装挑战界面。

开始、授权、开锁与结算界面可复用 `button-primary.svg`、`button-secondary.svg`，配合摄像头、锁、成功、失败、重试和暂停图标。按钮文字、倒计时与数值由代码绘制。

## 素材来源与限制

背景与透明 PNG 使用内置 imagegen，以确认的主游戏画面为参考分别生成；主要提示词要求保持正交俯视、明显方块像素、低饱和灰蓝与古金配色，并逐个隔离人物、展柜和名画。SVG 由 `build-ui.js` 生成。每张 PNG 是独立重绘素材，因此拼装结果与先前的整张概念图会有少量细节差异。`preview.html` 可用来核对最终效果。

从仓库根目录重新生成 SVG：`node design/ui/assets/build-ui.js`。重新扫描 PNG 透明边界：运行 `design/ui/assets/inspect-assets.ps1`。
