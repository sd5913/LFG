# Team Integration · LFG

## Keep V1 and V2 separate

```
LFG/
├── src/                       (group main game)
└── demos/
    ├── treasure-hand-unlock/  (working normal unlock V1)
    └── anime-seal-unlock-v2/  (this project)
```

Do not overwrite the group root `package.json`, `src`, or `main`. This V2 has its own Node static server, HTML, and JS entry points. Running it independently does **not** automatically wire it to the main React/Phaser app.

## Reusable modules

```js
import { STAGES, describeHand, evaluateStage } from './demos/anime-seal-unlock-v2/src/seal-recognizer.js';
import { RitualMachine } from './demos/anime-seal-unlock-v2/src/ritual-machine.js';
```

- `describeHand(normalized21, world21?)` → normalized image points + optional world landmarks; returns finger geometry.
- `evaluateStage('KON'|'GOJO'|'SHADOW'|'THUNDER', describedHands, poseLandmarks?)` → `{accepted, score, checks, debug}`.
- `new RitualMachine(onEvent)` → call `.update({matched: result.accepted, now: performance.now()})` on each game frame; `.snapshot()` returns progress and stage index.
- `numHands: 2` on Hand Landmarker; Pose Landmarker should run for THUNDER stage (landmark indices 11–16 shoulders/elbows/wrists).

**Important:** models are client-side. If the group already initializes MediaPipe Pose in its own code, share that model/stream instead of creating a second webcam capture in a nested component. The standalone `src/app.js` is only a reference adapter and UI renderer. Keep timestamps from `performance.now()` consistent.

## Browser success event from standalone V2

```js
window.addEventListener('lfg:anime-seal-unlocked', (event) => {
  const { source, steps } = event.detail;
  if (source !== 'camera') return; // DEMO: ignore fake simulator unlock
  console.log('Unlock treasure chest in main game:', steps);
  // gameScene?.openTreasureChest();
});
```

Simulation and Camera modes both dispatch an event with explicit `source` to support testing; only `source:'camera'` corresponds to the webcam pipeline. This is not a tamper-proof trust boundary; do not use it for real security decisions.

## Why rules are stage-specific

Gojo and One Piece crossed-finger seals can appear superficially similar; a single global classifier would have more confusions. In this demo a stage is evaluated only when active, so other seals do not compete. Stage thresholds are heuristic and should be tuned with actual player footage under consent; no training data or performance measurements were used.

## Suggested integration flow

1. Start the sequence only after thief reaches its treasure chest interaction radius.
2. Pause/slower guard and player movement while camera seal UI is open.
3. Reuse a single camera stream, MediaPipe Hand Landmarker (`numHands=2`), and Pose Landmarker if teammate already has it.
4. Feed the `RitualMachine` with each game's stage-specific match result.
5. Display checklists and hold progress to explain failures.
6. On final success and `source==='camera'`, open treasure chest and transition level.
7. Add a timeout / keyboard accessibility fallback for actual gameplay if tracking is unreliable, while clearly labeling it as fallback.

## Notes for academic report

- Distinguish **official MediaPipe landmarks** from **custom-coded hand-seal classification rules** and from **simulation inputs**.
- Document any AI-assisted development in project `process.md` if instructor requires it, and credit the original anime gesture references appropriately in the presentation.
- Since complex seals have occlusions, do real user testing, report actual outcomes, and avoid claiming validated recognition accuracy until measured.
