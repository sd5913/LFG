# LFG Museum Heist — Guard Flashlight Scan Demo v0.3 (Ground Patrol)

> SD5913 first working interaction, **5 November 2026**. Independent browser prototype for the guard's white vision cone, player exposure timer, statue-pose disguise, red alarm flash, and alarm sound.

## What this demo actually does

- A security guard **walks on the same floor baseline as the thief**, in the **foreground**, while the thief stands in the rear layer **behind the marble sculptures**. The white flashlight cone starts at the guard’s hand and sweeps horizontally across the gallery. The guard no longer floats near the ceiling.
- The **A / D** or **left/right** keys move the thief between two exhibits. The thief begins slightly to one side of the first sculpture so part of the character remains visible while still being behind the sculpture.
- When the thief enters the cone, a **3.2-second** warning countdown begins.
- If the thief is within range of a statue and **holds the matching pose continuously for 1.0 second**, the guard classifies the thief as a statue. No alarm occurs for that scan.
- If the thief is illuminated without a valid pose long enough, a **red warning light flashes** and the browser attempts to play a **siren**; the round fails.
- Press **F** (or **Focus beam**) to point the light at the player for 4.4 seconds. This is an **explicit demo/test shortcut**, not a planned final-game mechanic.
- An optional **experimental webcam mode** uses MediaPipe Pose Landmarker to estimate two upper-body poses. It downloads the library, WebAssembly files, and model at runtime; the webcam feature has not been physically validated with a real camera in this environment.

## Start it (Windows / VS Code)

1. Extract the ZIP into your project folder. Open **LFG_Guard_Scan_Demo** in VS Code.
2. Open VS Code **Terminal → New Terminal**.
3. Run `npm start` (requires Node.js, already used in SD5913).
4. In Chrome or Edge, visit **http://localhost:5173**.
5. Click **Start Patrol**. The manual simulation works without a webcam or an internet connection.

An alternative if Node isn't available:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Then open **http://localhost:8000**.

Do **not** just double-click `index.html`; its JavaScript uses ES modules, which should be loaded through a local development server. Browser microphone permission is not needed. Webcam mode requires camera permission and a supported browser on localhost/HTTPS.

## Fast tutor demonstration (about 45 seconds)

**Scenario A — Successful disguise**

1. Start Patrol. Leave the player beside the **T-POSE statue** (the starting location).
2. Click **Focus beam** or press **F** to force an immediate security scan.
3. While the light is on the player, **hold key `1` for at least 1 second**, or hold the *HOLD 1 T-POSE* UI button. The progress bar fills.
4. Status should change to **DISGUISE SUCCESS**; no siren sounds.

**Scenario B — Failed disguise / alert**

1. Press **Reset**, then **Start Patrol** and **Focus beam** again.
2. **Do not** hold `1`. Let the light cover the player for **3.2 seconds**.
3. Status changes to **SECURITY ALERT**; red flashes and a short electronic siren plays.

**Scenario C — Wrong pose / second statue**

1. Move next to the right-hand **ARMS UP** statue using D or →.
2. Press F and hold **`2`** for at least 1 second to match that pose (holding `1` here is the wrong pose).

**Troubleshooting:** If the auto-sweeping flashlight doesn't immediately encounter the player, use **F**. Browsers require a click/key interaction before sound can play. If there's no sound, first verify your browser tab isn't muted.

## Pose recognition: real versus simulated

- **Manual demo mode** is deliberately simulated input: `1` and `2` emulate pose-recognition results to test **only** scan timing and alarm logic. It is not real camera detection.
- **Optional webcam mode** tries to load `@mediapipe/tasks-vision@1.2.0` and the MediaPipe **pose_landmarker_lite** model. The matcher uses basic shoulder, elbow and wrist positions. It supports **T_POSE** and **ARMS_UP**. It is a basic heuristic rather than a trained custom pose-classification model and may produce false positives/negatives.
- No webcam stream is uploaded by this code to our own server. However, this first prototype fetches MediaPipe code/model assets from external servers, and normal browser/library service metrics may apply.
- If the camera fails, leave it disabled and continue with manual demo controls; this **does not prove real pose recognition works**.
- The final game should use the pose classifier owned by your designated teammate. It only needs to send a true/false match result to the guard system.

## Adjust the timing and geometry

In `src/guard-logic.js`:

```js
export const SETTINGS = {
  beamRange: 440,            // pixels
  beamHalfAngle: 0.30,       // radians (total cone angle ≈ 34°)
  warningMs: 3200,          // 3.2 seconds exposed before alert
  requiredPoseHoldMs: 1000, // 1.0 seconds matching pose to disguise
  statueRadius: 112,        // must be near a statue
};
```

In `src/patrol-motion.js`, `getGroundPatrol()` independently handles the grounded left-right movement and hand-held flashlight origin. In `src/main.js`, `scanMotion()` reads the resulting guard position and cone angle. The white beam rendering lives in `drawBeam()`; alarm blink in `drawBackdrop()` and `drawGameHud()`; sound in `beepAlarm()`.

## Integration with the group's Phaser/React application

The real group README currently proposes **React + Vite + Phaser + MediaPipe**, but the repository had **no runnable scaffold** when this prototype was created. This folder therefore uses native Canvas and **no npm dependencies**, to guarantee that the first interaction can be demonstrated independently.

When teammates create the Phaser project, copy **`src/guard-logic.js`** (or import it) and reuse:

```js
import { ScanController, playerInCone, SETTINGS } from './guard-logic.js';

const scan = new ScanController();

// In Phaser's scene.update(time, delta):
const origin = { x: guard.x, y: guard.y };
const visible = playerInCone(
  {x: player.x, y: player.y, width: 27, height: 70},
  origin,
  flashlightAngle,
  SETTINGS.beamRange,
  SETTINGS.beamHalfAngle
);
const result = scan.update(delta, {
  illuminated: visible,
  nearExhibit: Math.abs(player.x - activeStatue.x) < SETTINGS.statueRadius,
  poseMatched: poseModule.isMatching(activeStatue.pose), // team-owned classifier
});
if (result.event === 'alarm') {
  // scene.sound.play('alarm'); / show blinking red overlay / game-over state
}
if (result.event === 'disguised') {
  // allow the player to continue or record a successful statue challenge
}
```

For rendering in Phaser, use a `Graphics` object, `fillStyle`, `beginPath`, `moveTo`, `lineTo`, and `fillPath`; or build a cone texture. This UI's Canvas drawing is just an independent visual reference. See [Phaser Graphics docs](https://docs.phaser.io/phaser/concepts/gameobjects/graphics).

The interface is also available while the standalone demo runs:

```js
window.museumHeistDemo.setPoseMatch(true);  // simulate teammate output, overrides manual keys
window.museumHeistDemo.setPoseMatch(false); // mark pose as not matched
window.museumHeistDemo.clearPoseOverride();
window.museumHeistDemo.getState();         // current scan state, timer, required pose, etc.
```

## Automated checks

Run `npm test`. These tests check beam geometry, detection timer, successful disguise, no-cover failure, scan reset, and nearest exhibit selection. The **visual browser and webcam behavior still need hands-on testing** in Chrome/Edge.

## v0.3: Corrected foreground / background layering

- The guard and thief have **exactly the same ground-feet Y coordinate (460px)**. The guard is not elevated.
- The thief is drawn **behind the statues**, then the statues, white light cone and finally the guard are drawn on top. This creates a 2.5D foreground/background arrangement without a 3D engine.
- The guard now **patrols horizontally** and turns at either end of the floor corridor. The flashlight comes from the **guard's raised hand (~403px high)**, not from a high point near the museum ceiling.
- **F / Focus beam** remains a demo-only shortcut, temporarily making the guard face the thief, even while continuing to walk.
- `src/patrol-motion.js` is a reusable dependency-free module. `npm test` now also checks ground contact, turn-around and light detection from both directions.
- This is **visual layering + pose-based disguise**, not a physically simulated occlusion/shadow system. Being behind a statue alone does not block detection; the correct pose is still required.

## Known limitations and next steps

- This is **one screen**, not a side-scrolling level; 6–8 challenges, loot/exit narrative, physical guard occlusion, obstacles blocking light, full real-time pose accuracy, and browser deployment remain future group work.
- The spotlight currently passes through displays/statues; there is **no obstacle shadow/occlusion system** yet.
- The pose timer deliberately resets when the player leaves the cone. `DISGUISED` persists during the current uninterrupted scan and resets when the light moves away.
- If you walk away from a statue, the correct pose alone will **not** prevent alarm.
- Browser audio is synthesized by Web Audio oscillators; no external audio files needed.
- No finished integration with the group's future Phaser Scene is claimed.

## Credits / AI usage

- Code, logic, UI and procedural graphics in this prototype: drafted with OpenAI ChatGPT (GPT-6) with human-led specification and testing.
- Optional pose detection: Google MediaPipe Tasks Vision (Apache-2.0); optional model files sourced from Google's MediaPipe model hosting. See their respective usage/licensing notices.
- No third-party game graphics, photography, or sound recordings are included.
- The fonts attempt to load from Google Fonts but default to system fonts if offline.

For the course, document which parts each teammate tests, changes, and integrates. Log screenshots, issues and review feedback after the actual tutor session; do not present simulated pose input as validated webcam recognition.
