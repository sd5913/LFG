# Integration notes — LFG Main Game

本 Demo 不依赖主仓库，适合先验证 Room 01 玩法。日后整合 React / Phaser 时：

1. 复用 `assets/manifest.json` 中的 1671 × 941 原始坐标，所有贴图按原始 `original_x / original_y / width / height` 绘制。严禁重新随意拼排管道。
2. 用 `src/route.js` 的 6 段路线替换 Phaser 的自由移动。`state.s` 是沿管道的标量长度，映射到世界坐标使用 `routeAt(s)`。如果角色必须只在管道内移动，不能让主游戏中的默认碰撞/重力接管 `x,y`。
3. 喷气机关 `HAZARDS` 绝对不停气。跳跃用临时向上的绘制偏移 (`jumpHeight`)；低于安全跳跃高度穿越 `hazardAt()` 即失败。要换成 Phaser Physics 可为断口创建碰撞区，并要求 `isJumping`/足够离地高度。
4. 该 Demo 的 `VALVES` 是路由阻挡。未开启前不许跨越 `at`。UI `E` 调用当前关卡独立手势弹窗。真人摄像头解锁 / 键盘模拟必须保留区分。
5. 完成第一关可直接监听：

```js
window.addEventListener('lfg:pipe-room-complete', (event) => {
  const { timeSeconds, retries, valves, steamCleared } = event.detail;
  console.log('Ready for museum hall:', { timeSeconds, retries, valves, steamCleared });
  // Phaser / React router: enter next museum hall level here.
});
window.addEventListener('lfg:pipe-valve-opened', (event) => {
  console.log(event.detail.valveId, event.detail.source); // camera or keyboard-simulation
});
```

6. MediaPipe Hand Landmarker in `src/gesture-valve.js` uses a grip (at least 3 bent fingers) + 2D wrist tilt (>=38° for >=420ms), not a stock media-pipe recognized category. A reliable webcam pass rate **has not** been established; ask multiple group members to test lighting, hand size, occlusion, left/right hand, and mirror confusion.
7. Original canvas resolution is 1671×941. Game canvas scales with CSS but route coordinate math remains original-space; do not rescale input positions twice.
8. Browser end-to-end visual validation was blocked by current execution environment's browser policy. Source code unit tests and deterministic gameplay simulation completed; validate the displayed interface and gesture camera on the team's Chrome/Edge machine before merging.

## v1.1 视觉与交互补丁

- 额外加载 `assets/overlays/pipe_repairs_ladders.png`：原图背景和 manifest 管道之后、小偷之前绘制，修补缺口并增加左侧/出口梯子。
- 额外加载 `assets/overlays/pipe_foreground_braces.png`：小偷**之后**绘制，保持橙金色管道卡箍的景深遮挡。不能把整个不透明管道材质原图全部叠回去，否则小偷会完全消失。
- **未修改 manifest 的原始坐标**，新增梯子刚好对应现有六段受约束路线中的 `left-rise` 和 `right-down`。
- 新碰撞逻辑在 `src/route.js`：`steamState(h, elapsed)` 返回 `{active, remaining}`；`safeFromSteam(s, jumpElapsed, elapsed)` 仅在 OFF 且跳跃高度足够时允许穿越断口。
- `crawlRate(elapsed)` 创建间歇式位移脉冲，替代 v1.0 的匀速位置更新。新增的 `state.crawlClock` / `state.hurtTimer` 应在关卡重置时清空。
