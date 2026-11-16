# LFG — Treasure Chest Hand Gesture Unlock Demo (v0.1)

**SD5913 · Museum Heist · Independent final-chest interaction prototype**

A browser-based, real-camera **four-step hand gesture challenge**:

1. **POINT** — extend the index finger, fold the other fingers (hold ~0.65 s)
2. **PINCH** — touch thumb and index fingertips (hold ~0.70 s)
3. **FIST / GRAB** — clench a fist (hold ~0.70 s)
4. **ROTATE** — keep the fist clenched and rotate the *visible image-plane hand orientation* by about 50° (either direction)

The chest opens after all four steps. A per-step progress bar and camera-landmark overlay show what's happening.

## Start in VS Code

Requirements: Node.js 20+ and Chrome/Edge with camera. **Internet access is needed for the MediaPipe model and JS package to load** (Google's model hosting / jsDelivr). Fonts are optional.

```bash
npm start
```

Open **http://localhost:5173**. This project uses only Node's built-in HTTP server, so `npm install` is **not needed**. The camera requires `localhost` or HTTPS, not `file://`.

## Test modes (do not confuse them)

### Real camera — actual computer vision

1. Click **Start Real Camera** and allow camera access.
2. Hold one hand fully inside the camera frame; avoid backlighting or clutter.
3. Perform POINT → PINCH → FIST → ROTATE in order, waiting until each progress bar completes.
4. The on-screen **DETECTED GESTURE** display is the live result, **not a predefined fake reading**.
5. If PINCH is hard to trigger, increase *Pinch threshold* a little; if it triggers mistakenly, decrease it.

The webcam is processed **locally in the browser** using MediaPipe's Hand Landmarker. **This app does not upload, save, or record frames**. It downloads the MediaPipe package / model on first use. Third-party dependencies may have their own telemetry/privacy terms.

### Simulation — logic and demo only

With the camera OFF, hold `1` for POINT, `2` for PINCH, `3` for FIST. For ROTATE hold `3` and `←` or `→` for at least 50° simulated rotation. You can also *press and hold* the onscreen buttons with the mouse. **Auto demo (simulated)** replays all steps automatically. These controls DO NOT test camera recognition. The UI is clearly labeled SIMULATION MODE.

## Files

| File | Purpose |
|---|---|
| `index.html` | Stage, chest, webcam preview, gesture statuses and demo controls |
| `styles.css` | Complete responsive visual interface |
| `src/app.js` | Camera startup, model loading, 21-point drawing, sound & demo controls |
| `src/hand-gestures.js` | Scale-normalized classification of POINT, PINCH, FIST, OPEN; image-plane angle |
| `src/unlock-machine.js` | Ordered sequence, hold timers, 220 ms tolerance, rotation test, unlock event |
| `server.mjs` | Zero-dependency local Node server (localhost:5173) |
| `tests/logic.test.js` | Automated unit tests with synthetic landmark positions |
| `中文操作指南.md` | Chinese beginner-friendly instructions and playtest checklist |
| `TEAM_INTEGRATION.md` | Interface for adding the prototype to React/Vite/Phaser |

Run automated checks:

```bash
npm test
```

## Design choices / limits

- Single hand only (`numHands: 1`), either left or right.
- Gesture classification uses relative 2D landmark distances and finger-curl ratios, **not** a custom trained gesture ML classifier. This is a practical baseline, not a validated accuracy claim.
- "ROTATE" is **rotation in the camera image plane** (tilt your fist left/right), not reliable 3D twisting toward/away from the camera.
- A short drop in tracking freezes progress, but does not award success. Extended loss resets the unfinished rotation.
- "Point at lock" is currently an **index-finger gesture**; it does not check whether the finger visually lines up with the chest hotspot.
- To test recognition accuracy with real users, run the camera test at different hand distances, backgrounds and lights. Calibration and correction may be required before final submission.
- Camera recognition cannot be confirmed by the included unit tests or headless environment.

## Technical reference

- MediaPipe Hand Landmarker: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- MediaPipe package release pinned to **0.10.14**, to match the teammate's `feat/pose-shadow-demo` branch.
- Teammate branch: https://github.com/sd5913/LFG/tree/feat/pose-shadow-demo
- MediaPipe model URL: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`
- Core visuals are hand-authored SVG and CSS. No copyrighted commercial assets are included.
- AI assistance: ChatGPT helped generate the prototype structure, implementation, test cases and documentation. Team members must personally verify and credit third-party code/assets prior to submitting the final project.

**This is a standalone demo; it does NOT overwrite or commit to the group's GitHub repository.**
