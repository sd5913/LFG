# Integration with LFG React / Vite / Phaser

Checked against the teammate's `feat/pose-shadow-demo` branch: the project uses React + Vite and MediaPipe Tasks Vision `0.10.14` loaded dynamically. This demo matches that MediaPipe version and is deliberately framework-independent for easy integration.

## Recommended minimal integration

**Do not copy this demo's entire `index.html` over your teammate's game.** Instead, copy these two pure modules:

- `src/hand-gestures.js` (import `analyzeHand`)
- `src/unlock-machine.js` (import `UnlockMachine`)

Install **or** import `@mediapipe/tasks-vision` as your teammate's component does; reuse one MediaPipe `FilesetResolver`. Load a separate **HandLandmarker** (the teammate's PoseLandmarker cannot detect 21 detailed finger joints).

```js
import {analyzeHand} from './hand-gestures.js';
import {UnlockMachine} from './unlock-machine.js';

const gameUnlock = new UnlockMachine((event) => {
  if (event.type === 'unlocked') {
    // React: setChestOpen(true); or Phaser: scene.events.emit('chest-unlocked')
    console.log('Treasure acquired!');
  }
});

// In your existing camera detection loop:
const handResult = handLandmarker.detectForVideo(videoElement, performance.now());
const landmarks = handResult.landmarks[0] || null;
const {gesture, angle} = analyzeHand(landmarks);
const result = gameUnlock.update({gesture, angle, now: performance.now()});
// result.step: POINT / PINCH / FIST / ROTATE / OPENED
// result.progress: 0..1 for the current stage
// result.unlocked: boolean
```

**Important:** The `src/app.js` entry point also dispatches a browser event when the chest opens:

```js
window.addEventListener('lfg:treasure-unlocked', (event) => {
  console.log(event.detail); // { item: 'ancient-relic', source: 'camera'|'simulation', unlocked: true }
});
```

The simulation source tag is intentional: the final game should only accept `source === 'camera'` for a real hand-based win, or clearly allow keyboard as an accessibility choice.

## Tips for React + Phaser integration

- Mount the chest component only when the thief reaches the final display case.
- Stop / pause guard patrol and keyboard character movement while the chest challenge is active.
- Send `gameUnlock.reset()` each time a new treasure challenge starts.
- Keep a single browser webcam stream when possible and share frames (instead of opening two competing camera streams).
- You can share video frames between PoseLandmarker and HandLandmarker, but run each task separately, ideally at capped frame rates to avoid low FPS.
- All browser camera code requires a secure context (`localhost` or HTTPS).
- When leaving the chest page, clean up animation frames, camera tracks if owned, and model task instances.
- Do not confuse the model's hand tracking results with gesture classification. Hand Landmarker outputs positions; `analyzeHand` classifies those positions using tunable geometry rules.

## Limits that must be disclosed

- Classifier thresholds have not been calibrated with actual webcam recordings in the model's working environment.
- Rotation is 2D tilt relative to the camera image; not full depth-based wrist twist.
- The optional `Pinch threshold` slider adjusts only the thumb/index distance; other gesture ratios are configurable in `src/hand-gestures.js`.
- The demo allows LEFT or RIGHT rotation (absolute 50°), minimizing handedness and camera mirroring confusion.
- Only one hand is tracked at a time; use a well-lit image and keep the hand fully visible.

## Credits

- MediaPipe Tasks Vision: Google / Apache-2.0 (verify current license and privacy conditions before final release)
- Model: Google MediaPipe Hand Landmarker float16/1
- Assistant-aided code and documentation: ChatGPT (2026-11-16). Review all code before final submission.
