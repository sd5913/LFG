# LFG · ANIME SEAL UNLOCK V2.0

独立可运行的 **Museum Heist 宝箱四重结印** 原型，作为 V1 常规开锁机制之外的第二套机制。四个手势参考日漫标志性造型，界面与代码为原创实现，未包含动漫原画或原始音效。

## 快速运行（Windows / VS Code）

1. 解压完整 ZIP，**用 VS Code 打开 `LFG_Anime_Seal_Unlock_V2` 文件夹**（文件夹里面必须能看到 `package.json`）。
2. Terminal → New Terminal。
3. 执行 `npm start`（Node.js ≥20，**无需 npm install**）。
4. Chrome / Edge 打开 <http://localhost:5173>，点击 **开启真实摄像头** 并允许权限。
5. 第一次启动需要访问 CDN 下载 MediaPipe 浏览器代码、WASM 和模型。运行时视频在浏览器本地处理；本项目的 Node 服务器只负责静态文件。
6. 如果暂时无法联网加载模型，可点击 **自动展示四重结印**，但它只验证游戏流程，不能证明真人识别准确率。

**遇到 ENOENT？** 请先运行 `pwd` / `dir` 确认 Terminal 路径，应该位于**包含这个 `package.json` 的文件夹**，不是 LFG 的根目录。端口占用可在终端执行 PowerShell: `$env:PORT=5174; npm start`，浏览器改开 `http://localhost:5174`。

## 四阶段规则

| 顺序 | 创意参考 | 实际识别要求 | 默认持续时间 |
|--|--|--|--|
| 01 · KON | 《电锯人》早川秋狐狸手印 | 1 手：食指、小指形成耳朵，中指无名指与拇指组成狐狸嘴 | 850 ms |
| 02 · VOID | 《咒术回战》五条悟无量空处 | 1 手：食指伸起，中指弯曲并勾近食指上半段，其他手指收起 | 900 ms |
| 03 · CROSS | 《火影忍者》鸣人影分身 | 2 手：两组食指+中指伸出，交叉成约 90° 十字并相互靠近 | 1050 ms |
| 04 · THUNDER | 《美少女战士》木野真琴招式造型 | 上半身：双前臂交叉成 X；至少一手食指/小指伸出 | 1200 ms |

以上是为了**可识别性做的原作近似规则**，不是逐像素复刻，且没有训练专门的动漫手印分类模型。通过条件按当前关卡单独判定，避免不同手势互相竞争类别。

## 技术设计

- `src/seal-recognizer.js`：MediaPipe 21 个手部关键点的关节角度、指尖相对位置、双手方向关系、双臂交叉 X 规则。包含 `STAGES` 和 `evaluateStage(stageId, hands, pose)` 公共接口。
- `src/ritual-machine.js`：四关顺序、连续保持进度、220ms 短暂识别丢失容错和成功事件。
- `src/app.js`：浏览器摄像头、Hand Landmarker（`numHands: 2`）、Pose Landmarker（最终关才执行人体推理）、关键点叠加、两种输入模式。
- `index.html` / `styles.css`：原创封印法阵与宝箱、进度条和 Live Debug UI。
- `server.mjs`：本地零依赖 HTTP 服务器。
- `tests/logic.test.js`：纯 JavaScript 逻辑测试，`npm test`。

JS 侧从 jsDelivr 加载 `@mediapipe/tasks-vision@0.10.14`，模型来自 Google MediaPipe 模型资源链接。模型需联网加载，且 GPU 失败会尝试 CPU 回退。支持浏览器与电脑性能因设备而异。

### 识别逻辑有多严格？

- 单手/双手关卡分别独立验证，保留**约 1 秒持续匹配**的要求。
- 使用关节角度和相对距离，而不是要求手掌必须转到固定的侧面角度。
- 第 3 关需要两只手都被识别，并呈明显十字夹角；第 4 关加入肩、肘、腕的位置判断。
- 右侧 Live Debug 会实时显示每个判定条件是否满足。
- **遮挡是固有限制**：单目摄像头无法可靠识别被另一只手完全遮住的指尖。第 3、4 关的稳定性必须经过真人测试。

### 独立 Demo 的事件

完成后派发浏览器事件：

```js
window.addEventListener('lfg:anime-seal-unlocked', (event) => {
  if (event.detail.source !== 'camera') return; // 防止模拟模式给主游戏开箱
  console.log('Real-seal unlocked!', event.detail.steps);
});
```

**注意：这个事件适合本地游戏交互，不是安全认证手段。** 浏览器 JS、摄像头结果和模拟模式都不能用来保护真实财产或敏感数据。

## 开发与验证状态

- `npm test`：已通过 **21 项纯逻辑测试**（包括标准模拟关键点、错误动作、进度计时与完整开锁流程）。
- 已使用浏览器测试 **Simulation 自动展示**：四步完成后打开宝箱、UI 正常更新。
- **未在真实笔记本摄像头上进行四种动漫手印的准确率实测**；需要用户用真实摄像头测试指型，必要时微调 `src/seal-recognizer.js` 内的阈值。尤其是二手交叠的影分身手印与最终姿势。

## 原仓库与协作

推荐放在自己的分支 `feat/treasure-hand-unlock` 的独立目录：

```
LFG/
└── demos/
    ├── treasure-hand-unlock/      # V1 保留
    └── anime-seal-unlock-v2/      # 本 Demo 的全部内容
        ├── package.json
        ├── server.mjs
        ├── index.html
        ├── styles.css
        ├── src/
        └── tests/
```

只复制本文件夹的内容，不要把主项目的 `main` / `src` 共享代码删除。独立运行与整合主游戏是两回事；主游戏可以通过导入 `seal-recognizer.js` 或监听事件来集成。

## 相关技术文档

- https://developers.google.com/edge/mediapipe/solutions/setup_web
- https://developers.google.com/edge/api/mediapipe/js/tasks-vision.handlandmarker
- https://developers.google.com/edge/api/mediapipe/js/tasks-vision.poselandmarker
