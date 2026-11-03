# Museum Heist

> **Project status: Planning stage.** This repository is currently used to plan an SD5913 Group Project. The features, technology stack, and setup process are still awaiting implementation and validation. Planned items should not be treated as completed or tested features.

Museum Heist is a browser game that combines keyboard-controlled stealth with upper-body pose recognition. The player moves behind museum display cases and imitates nearby statues or exhibits whenever a security camera is about to spot them. After passing 6–8 challenges, the player reaches the target display case and steals a small, portable antique.

## Project Overview

- **Target audience:** Young players who enjoy light interactive games and want a more entertaining way to include simple physical activity in their day. The experience is particularly suitable for people who want to move their upper body and relax after sitting for a long time.
- **Player actions:** The player uses the keyboard to move behind display cases. When a security camera is about to detect the character, the player follows an on-screen prompt and copies the upper-body pose of a nearby statue or exhibit. Some events require the player to remain still or follow the changing pose of a kinetic exhibit.
- **System response:** The game displays the character's position, security-camera scan beams, alert status, target pose, matching progress, and pose-recognition result. A successful match allows the player to resume moving. A failed match increases the alert level or triggers a fail state.
- **Story:** The player infiltrates a museum at night, uses display cases to remain partially hidden, and imitates exhibits to deceive the security cameras. After completing a series of disguise challenges, the player reaches the final display case, steals a small antique, and attempts to escape from the museum.

## Core Gameplay Loop

1. The player hides behind display cases and uses the keyboard to move towards the target.
2. Rotating security cameras continuously scan the gallery, and their beams gradually approach the player.
3. When the player is about to be detected, the game starts an emergency disguise challenge.
4. The player copies the upper-body pose of a nearby statue or exhibit and holds the pose until the evaluation is complete.
5. If the pose is accepted, the camera mistakes the player for an exhibit and the player can continue moving. If the pose is rejected, the alert level increases or the current attempt ends.
6. After passing 6–8 increasingly difficult challenges, the player reaches the target display case and steals a small antique.

## Planned Features

- Keyboard-controlled stealth movement through a museum gallery, using display cases as cover.
- A final display case containing the target antique.
- Continuously rotating security cameras with visible scan beams.
- Emergency upper-body pose-matching challenges that repeatedly interrupt the stealth sequence. Successful matches allow the player to continue moving.
- A planned sequence of 6–8 disguise challenges that progress from simple to more difficult. The final number will depend on recognition stability and the available development time.
- Special events in which the player must remain still while a camera locks on, or copy the new pose of an activated kinetic exhibit.
- A small, separate antique to steal after all challenges are complete. The statues and exhibits copied during earlier challenges are not the final loot.
- Clear win, fail, and retry feedback.
- Multimedia elements such as a museum environment, display cases, artifact images, pose instructions, scan-beam animations, and appropriate sound effects.

**Demo scope:** A loot showcase, facial AR try-on, complex levels, and leaderboards are outside the current demo scope. They may be reconsidered only if the core experience is complete and time remains.

## Planned Technology Stack

- Visual Studio Code (VS Code)
- React + Vite
- Phaser
- JavaScript + Canvas
- MediaPipe Pose Landmarker for browser-based upper-body landmark detection

These are planned technologies and do not indicate that a working implementation already exists in the repository. The team will first validate a small interaction and adjust the technology choices and project scope based on the results.

## Getting Started

**Current status:** A small, independently runnable pose-shadow prototype is available. The full Museum Heist game is still planned rather than implemented.

- **Requirements:** Node.js 20+ and a current Chrome, Edge, or Safari browser with an available camera. Camera access normally requires `localhost` or HTTPS.
- **Installation:** `npm install`
- **Run locally:** `npm run dev`, then open the local URL printed by Vite.
- **Build/demo:** `npm run build` creates the production bundle; `npm run preview` serves it locally.

### Pose Shadow Lab prototype

The first working interaction is at the root page. Select **Start camera**, grant camera permission, and move your head, shoulders, arms, or hands. MediaPipe Pose Landmarker detects one upper body and renders a mirrored 2D skeletal shadow in real time. The prototype gives compact, chest-level statue-inspired target poses (hands at heart, holding a scroll, or crossed arms). The dashed target uses the same landmark topology as the live skeleton and uses the player's detected arm lengths to construct a reachable target; the heart-pose elbow spread also adapts to the player's detected shoulder width. Each target elbow or wrist point turns white with a glow when its live counterpart enters a tolerance of approximately 46% of the detected shoulder width. A 220ms grace period prevents a momentary tracking jump from resetting progress; keep every required point aligned for two seconds to clear it and move to the next task.

- Camera frames and landmarks are processed in the browser and are not recorded or uploaded by this demo.
- The MediaPipe task model is downloaded from Google's public model hosting on first use, and the browser library is loaded from jsDelivr; an internet connection is therefore needed for the first run.
- Detection quality depends on lighting, framing, camera permissions, and GPU/browser support. Keep the upper body visible in frame.

## Project Progress

| Date | Plan / Record |
|---|---|
| 1 Nov 2026 | Defined the museum-infiltration concept and the combination of keyboard movement with upper-body pose challenges. Implementation status is still to be confirmed from the repository contents. |
| 5 Nov 2026 | Planned: demonstrate the first working interaction and record scope confirmation and testing evidence. |
| 12 Nov 2026 | Planned: integrate the core experience. |
| 19 Nov 2026 | Planned: conduct a playtest with another user and record feedback and resulting changes. |
| 26 Nov 2026 | Planned: prepare the delivery candidate and complete the setup instructions, limitations, and credits. |
| 3 Dec 2026 | Planned: final tutor review. |
| 6 Dec 2026, 23:59 HKT | Final submission deadline. |

## Credits: Code, Assets, Data, and AI Use

Before release, this section will document all third-party code, libraries, images, audio, fonts, data, and tools actually used in the project, including their sources, authors where available, licenses, and any modifications. AI-assisted code, writing, and visual assets will also be credited with the tool used and its purpose, in accordance with course requirements and applicable asset licenses.

| Item | Source / Author | License or Notes | Use / Modifications |
|---|---|---|---|
| MediaPipe Tasks Vision / Pose Landmarker Lite | Google / MediaPipe | Apache-2.0; confirm before release | Browser-local, single-person upper-body landmark detection for the prototype |
| DM Mono and Playfair Display | Google Fonts | See Google Fonts licensing | Prototype typography |

## Known Limitations

- Pose-recognition quality may vary with lighting, camera angle, occlusion, the player's distance from the camera, and device performance.
- Upper-body pose selection and matching tolerances will require playtesting with different users. Landmark detection should not be treated as reliable identity recognition.
- Camera functionality requires browser permission and a compatible device. Supported platforms have not yet been verified. Camera-processing behaviour and privacy information should be clarified before implementation.
- Keyboard layouts, accessibility, and alternative control methods still need to be evaluated during prototyping.
- Setup instructions, feature status, and compatibility remain TBD and should not be considered tested.

## Planned Milestones

- **5 Nov 2026:** First working interaction
- **12 Nov 2026:** Integrated core experience
- **19 Nov 2026:** Playtest, feedback collection, and documented revisions
- **26 Nov 2026:** Delivery candidate
- **3 Dec 2026:** Final tutor review
- **6 Dec 2026, 23:59 HKT:** Final submission deadline
