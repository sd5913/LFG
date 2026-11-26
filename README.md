# Museum Heist

A pixel-art stealth game with gesture controls. Sneak into the museum through the ventilation tunnels, evade the guard by posing like the statues, unlock the treasure chest with hand gestures, and make it to the getaway van.

**[Play Museum Heist online](https://sd5913.github.io/LFG/)** · The game starts in the ventilation tunnels.

## Game stages

| Stage | Gameplay | How to finish |
| --- | --- | --- |
| 01 · Ventilation Tunnels | Climb ladders, jump over steam gaps, open diversion valves, and dodge rats. | Reach the green `EXIT` to enter the gallery. |
| 02 · Gallery Disguise and Treasure Unlock | Evade the guard, mimic the statues, and unlock the chest with four hand gestures. | The street escape begins after the chest opens and the success message appears. |
| 03 · Street Escape | Clear street obstacles and play three rounds of rock–paper–scissors if the guard catches you. | Reach the getaway van. |

## 01 · Ventilation Tunnels

- Use **WASD** or the **arrow keys** to move through the tunnels and climb ladders.
- Press **Space** to jump across a gap while the steam is off.
- Press **E** near a diversion valve to open the gesture panel. Make a fist and rotate your wrist to open the valve, or hold **Enter** to simulate opening it.

## 02 · Gallery Disguise and Treasure Unlock

Use the display cases as cover while the guard patrols the gallery. A blue outline appears when you are fully hidden behind a case. Press **Space** to start the pose challenge for that case.

Each display case has a statue reference image and a unique pose. Once you enable the camera in the gallery, MediaPipe tracks your pose locally in the browser. The challenge shows your live skeleton, the target pose, and your progress. Matching the pose returns you to the same spot in the gallery and sends the guard back on patrol.

If the guard spots you, they give chase and the alert level rises. The game ends at 100% alert.

### Controls

- Use **WASD** or the **arrow keys** to move.
- Select **Enable camera** in the top bar to grant camera access for pose challenges. Select **Turn off camera** to stop it.
- Press **Space** behind a blue-outlined case to start its pose challenge. Press **Space** again to leave the challenge and return to the gallery.
- Press **Space** near the treasure chest to start the four-step gesture challenge. The chest-opening animation plays after you complete it.
- Press **F2** to show or hide collision bounds.
- Press **R** to reset your position.

## 03 · Street Escape

- Press **A** or **D** to move, **Space** to jump, **Space** twice for a longer jump, and **Ctrl** to crouch.
- Hitting an obstacle raises the alert level. If the guard catches you, a game of rock–paper–scissors begins. You are arrested at 100% alert.
- Play rock–paper–scissors with the camera or use the camera-free demo mode. Reach the getaway van to complete the escape.

## Run locally

Install Node.js and pnpm, then run the following commands.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite, usually `http://127.0.0.1:5173/`, to start at stage one. For debugging, append `?stage=museum` or `?stage=escape` to jump directly to stage two or three. Allow camera access in your browser to use camera-based controls.

Use the **中文 / EN** buttons in the bottom-right corner to switch between Chinese and English. The game keeps your choice across stages and remembers it the next time you open it.

### Common commands

```bash
pnpm test
pnpm build
pnpm preview
```

On Windows, you can also run the startup script.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1
```

## Technical overview

| Technology | Role |
| --- | --- |
| React + Vite | Game UI, camera permissions, and pose challenge transitions |
| Phaser 3 | Gallery map, movement, collisions, occlusion, and the guard's field of view |
| MediaPipe Tasks Vision / Pose Landmarker Lite | Local upper-body pose tracking for one player |
| Nearest-neighbor scaling | Keeps pixel-art assets sharp |

### Key files

| Path | Role |
| --- | --- |
| `src/main.jsx` | Stage transitions, the camera toggle, and gallery interactions |
| `Pipe_Room_demo_v1/` | Tunnel route, diversion valves, and the exit event |
| `src/game/Room1.js` | Gallery scene, guard AI, alert level, and cover detection |
| `src/game/config.js` | Map, display cases, characters, guard, and collision configuration |
| `src/pose-shadow-demo.jsx` | Poses for each display case, skeleton rendering, and pose matching |
| `src/treasure-unlock.jsx` | Gesture unlock, chest animation, and success message |
| `src/street-escape.jsx` | Street escape, obstacles, and guard pursuit |
| `src/styles.css` | HUD, pixel-art UI, and responsive layout |

## Assets and credits

See [CREDITS.md](CREDITS.md) for team artwork, third-party libraries, and AI assistance. Asset sources and verification details are listed in [ASSETS.md](ASSETS.md).

Updates are committed and pushed on request. Pushing to `main` triggers a GitHub Pages deployment.
