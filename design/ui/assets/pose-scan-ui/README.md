# 途中姿势扫描界面 · 可拆分 UI

这一套按确认的低饱和像素风画面重新制作，画布为 **1672 × 941**。所有 SVG 都是独立透明部件；深色区域只属于对应面板，不会把整张图片变成不透明背景。[打开拼装预览](preview.html)可以切换警戒条、姿势保持条和倒计时，[透明素材画廊](gallery.html)可以逐个查看。

## 资源

| 部分 | 文件 | 用法 |
| --- | --- | --- |
| 顶部 HUD | `hud-strip.svg`、`alarm-siren.svg`、`route-track.svg`、`route-museum-icon.svg`、`route-player-marker.svg`、`treasure-frame-icon.svg` | 叠在游戏场景最上层；路线上的怪盗标记可按进度移动，数字和文字由代码绘制 |
| 警戒条 | `alarm-000.svg` … `alarm-100.svg` | 从 0% 到 100%，每 10% 一档；40% 与截图对应，100% 触发失败 |
| 扫描警告 | `warning-banner.svg`、`warning-icon.svg` | 标题与剩余秒数由代码绘制 |
| 目标动作 | `target-panel.svg`、`target-pose-arms-out.svg` | 大尺寸动作剪影，可替换其他目标姿势 |
| 摄像头识别 | `tracking-panel.svg`、`camera-window.svg`、`tracking-pose-arms-out.svg` | 轮廓是占位示意，真实视频和关键点需由摄像头代码覆盖 |
| 姿势保持条 | `hold-000.svg` … `hold-100.svg` | 从 0% 到 100%，每 10% 一档，另有截图中的 `hold-062.svg` |
| 底部结果 | `footer-panel.svg` | 成功/失败说明文字由代码绘制 |

`manifest.json` 列出每个部件在原画幅中的 `[x, y, width, height]`，以及需要实时更新的文字位置。将每个 SVG 放在对应位置，就能拼回挑战界面。切换进度时替换相应 SVG 文件；若希望进度更平滑，可只保留条框并在代码中改变填充宽度。

`scene-reference.png` 仅用于拼装预览，不属于交互 UI。游戏中应使用真实场景作底图，并在弹出挑战时把场景压暗。背景压暗色与透明度也记录在 `manifest.json`。

从仓库根目录运行生成脚本：`node design/ui/assets/pose-scan-ui/build.js`。这些部件以提供的界面截图为视觉参考，用代码绘成独立 SVG；因此文字作为动态内容保留在预览和清单中，不被烘焙进进度条图片。
