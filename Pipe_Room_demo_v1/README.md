# LFG · ROOM 01 — Service Pipe Infiltration

独立可运行的浏览器关卡，使用用户提供的 Room 01 原始美术素材及精确坐标。

## 运行

在 VS Code 打开本项目所在的文件夹（这里必须看得到 `package.json`），打开 Terminal：

```powershell
npm start
```

然后在 Chrome / Edge 打开 http://localhost:5173 。不需要 `npm install`。如端口占用，请先在之前的终端按 Ctrl+C 停止旧 Demo。此时若需换端口：PowerShell 运行 `$env:PORT=5174; npm start`，浏览器对应打开 `http://localhost:5174`。

## 游戏操作

| 键盘 | 游戏行为 |
|---|---|
| ← → / A D | 在水平管道中左右爬行（只允许与管道方向一致的移动） |
| ↑ / W | 从右侧梯子爬上中层，或在左侧竖管向上 |
| ↓ / S | 顶层最右端进入下降管，抵达出口 |
| Space | 提前起跳，飞跃一直喷气的危险断口 |
| E | 在关卡阀门附近打开手势控制面板 |
| 进入阀门面板后启动 Camera | 真实握拳 → 保持握拳并在画面内倾斜约 38° → 阀门开启 |
| 进入阀门面板后按住 Enter 1.2 秒 | **明确标注的键盘模拟**，仅用于测试游戏逻辑，不代表摄像头识别 |
| ESC | 退出阀门弹窗 |

## 正确通关路线

1. 左下角入口：沿底层往右爬；第 1 个缺口有不间断喷气，提前按 Space 跳过。
2. 到右边的梯子后按 ↑ / W，一直爬到中层。
3. 中层往**左**爬，跳过第 2 个喷气口。
4. 靠近左侧阀门（diversion_valve_left），按 E 开启。未开启时无法继续进入左侧弯管。
5. 沿左侧竖管 ↑ 向上，走顶层向右，跳过第 3 个喷气断口。
6. 靠近顶层右侧阀门（diversion_valve_right），按 E 开启。
7. 走到顶层最右，按 ↓ / S 往下，通过右下绿色出口通关。

**碰到喷气**：自动送回对应断口前的安全位置，可以无限重试，记录 RE​​TRIES 数量。三个气口不会停止喷气；必须跳过。

## 文件布局

- `assets/background/`：用户提供的清洁背景
- `assets/pipes/`：原管道分段贴图
- `assets/interactables/`：阀门、梯子、入口、出口
- `assets/manifest.json`：原文件各组件精确位置（**未更改坐标**）
- `assets/thief/`：用户四张小偷角色图片仅按透明像素边缘裁切，原内容保留
- `src/route.js`：6 段互相连接的可行走路线、断口判定与阀门位置
- `src/gesture-valve.js`：MediaPipe 手部关键点导出的握拳 / 画面内旋转规则和连续状态机
- `src/game.js`：场景拼接、角色绘制、键盘控制、跳跃、蒸汽、两个阀门弹窗、摄像头、HUD、关卡完成
- `tests/*.test.js`：路径 / 阀门 / 跳跃测试与确定性的全路线模拟测试
- `server.mjs`：本地静态服务器，不需要 Node 依赖安装

## 摄像头与手势

阀门使用 MediaPipe Hand Landmarker（21 个关键点），检测“闭合拳头 0.55 秒 → 持续握拳并在镜头平面内将手倾斜约 38°”的动作。阈值可以在 `src/gesture-valve.js` 中调整。为降低镜像困扰，左右倾斜均接受。注意：不是实际三维门把手旋转动作。

MediaPipe JavaScript 模块和模型在首次开启摄像头时从外部 CDN 加载，必须联网、浏览器允许摄像头权限，并从 `localhost` 或 HTTPS 访问。键盘 `Enter` 只是 **simulation fallback**。摄像头原始画面仅在本地浏览器处理，Demo 没有后端上传摄像头帧；使用第三方模型 CDN 的网络请求不等同于上传画面。

## 测试

```powershell
npm test
```

包含自动路线走通、3 个断口跨越、2 个阀门开闭及基础逻辑单测。**自动测试不能证明真人手势识别准确率**：这需要用实际笔记本摄像头试玩。由于当前执行环境阻止自动浏览器导航，最终的互动页面也需要在本机确认；静态地图已按 manifest 坐标单独合成核对。

## 你们未来要接回 LFG

- 关卡完成时：`window` 上派发 `lfg:pipe-room-complete` CustomEvent
- 阀门打开时：派发 `lfg:pipe-valve-opened` CustomEvent
- `detail` 中的 `source` 会区分 `camera` 与 `keyboard-simulation`（仅阀门事件）
- 这是**独立可玩的关卡原型**，未自动修改你们小组的 React / Phaser 主游戏。接入请看 `TEAM_INTEGRATION.md`。

> 美术来源：你提供的 Room 01 ZIP 和四个小偷 PNG；无额外第三方游戏素材。请在提交时按课程要求记录使用 AI 辅助编程的范围。
