# LFG — Room 01：地下管道潜入 v1.1

在 v1.0 的基础上按实际试玩反馈修复五个问题：补左侧与右侧竖梯、修补左上管道缺口、爬行动作节奏、间歇性蒸汽、管道金属卡箍前景遮挡。使用你上传的 **原始背景、管道、阀门、梯子和小偷立绘**；`assets/manifest.json` 未改动。**没有修改小组 GitHub 主分支。**

## 在 VS Code 运行

1. 解压 ZIP，用 VS Code **打开 `LFG_Pipe_Room_01_v1.1` 文件夹**（里面应看到 `package.json`）。
2. 菜单 Terminal → New Terminal，输入 `npm start`。
3. Chrome / Edge 打开 http://localhost:5173 。无需 `npm install`。
4. 如果旧版已经占用 5173，在旧版 Terminal 按 `Ctrl+C`。也可以用 PowerShell `$env:PORT=5174; npm start`，然后打开 http://localhost:5174 。

## 新版关键玩法

| 部分 | 操作 | 游戏判定 |
|---|---|---|
| 水平管道 | `← / →` 或 `A / D` | 只能沿管道爬行。现加入短促伸手 / 停顿的爬行节奏（无新的逐帧精灵）。 |
| 右侧上升梯 | 到右下拐角按 `↑ / W` | 从底层爬到中层，路线被限制在梯子内部。 |
| **左侧上升梯（新增立绘）** | 中层最左端按 `↑ / W` | 从中层爬到顶层。新增源素材的梯子。 |
| **右侧出口梯（新增立绘）** | 顶层最右端按 `↓ / S` | 从顶层沿右侧管道向下，接近绿色出口完成关卡。 |
| 三个断口 | 观察 `ON / OFF` 和倒计时 | **ON（橙色）绝对不可通过，连跳跃也不行**。**OFF（绿色）才能用 `Space` 起跳**；未跳跃仍会掉入断口。 |
| 阀门 | 靠近按 `E` | 弹出摄像头开阀界面：握拳 → 保持握拳并倾斜。亦可按住 Enter 1.2 秒进行明确标注的模拟测试。 |
| 重试 | 碰到蒸汽或未跳过断口 | 返回该断口前的安全位置，短暂击退冷却，避免连续误伤。 |

当前蒸汽节奏：每个喷气口约 **喷气 3.9 秒 → 停喷 2.7 秒**，三个喷气口的起始相位不同（不同时停喷）。可以在 `src/route.js` 中调整 `STEAM_PERIOD=6.6`、`STEAM_ON_DURATION=3.9` 及每个 hazard 的 `phase`。

## 路线

左下入口 → 底层向右（蒸汽 1）→ 右侧梯子向上 → 中层向左（蒸汽 2）→ 左侧阀门按 E → **左侧新梯子向上** → 顶层向右（蒸汽 3）→ 右侧阀门按 E → **右侧新梯子向下** → 绿色出口。

## 五项修改分别在哪里？

1. **新梯子**：`assets/overlays/pipe_repairs_ladders.png`，从素材包 `ladder_inside_pipe.png` 重组。左侧和出口上方均可见。
2. **上方缺口修补**：同一 overlay，用 `pipe_top_straight_01.png` 的无卡箍部分补齐左上弯管到顶层直管之间的连接；还补了出口梯底部的小连接段。
3. **带停顿爬行**：`src/route.js` 的 `crawlRate()`；`src/game.js` 的 `updateGame()` 与 `drawPlayer()`。仅复用现有静态角色图，模拟顿挫及轻微身体变化，不是完整逐帧爬行动画。
4. **间歇蒸汽**：`src/route.js` 的 `steamState()`、`safeFromSteam()`；`src/game.js` 的 `drawSteam()`、`drawVentStatus()` 和碰撞判定。
5. **金属卡箍遮挡**：`assets/overlays/pipe_foreground_braces.png` 在小偷**之后**绘制，保留原始橙金色卡箍与管壁边缘的遮挡，管道中间保留透明视野。可使用 `tools/build_visual_layers.py` 从源素材再生成这两张覆盖层（仅重建素材时需 Pillow）。

## 调整游戏手感

- 想调人物整体移动速度：`src/game.js` 顶部 `PLAYER_SPEED=218`，建议 190–235 之间试。
- 想让“爬一下，停一下”更明显：`src/route.js` `CRAWL_STROKE_SECONDS=.36`、`crawlRate()` 中尾段的 `return .08`（停顿移动倍率），延长停顿段可增加顿挫。
- 想调整跳跃滞空：`src/game.js` `JUMP_DURATION=1.2`；`src/route.js` 的 `jumpHeight(elapsed,duration=1.2)` 同步调整。
- 想延长停喷窗口：降低 `STEAM_ON_DURATION`，不要只改视觉效果，应同时保留碰撞判断。

## 摄像头与代码整合

- 保留原先 MediaPipe Hand Landmarker 阀门手势模块。需要联网加载模型，允许摄像头权限，并使用 localhost / HTTPS。
- `Enter` 模拟开阀只是给游戏测试使用，事件来源会标记为 `keyboard-simulation`。
- `lfg:pipe-valve-opened`：阀门解锁事件，`detail.source` 区分 `camera` 与 `keyboard-simulation`。
- `lfg:pipe-room-complete`：成功进入大厅的关卡完成事件。
- 推荐在自己的功能分支独立放进 `demos/pipe-room-01/`，先测试完成再通过 Pull Request 整合。

## 验证

在 VS Code 输入 `npm test`：**23 项 Node 逻辑测试通过**，包括一个考虑蒸汽周期、等待 OFF、起跳、双阀门和完整路线的模拟通关测试。地图外观已按原始素材重建并生成 `preview_repaired_map.jpg` 核对。浏览器自动化环境拦截了本地页面，因此**无法声称已经在真实浏览器或摄像头完成端到端测试**；请在你的 Windows Chrome / Edge 试玩后检查画面遮挡与角色体感。

本项目只用了你上传的美术素材及由它们重新裁剪/合成的覆盖层，不含额外第三方游戏资产。
