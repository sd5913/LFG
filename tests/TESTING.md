# Room 1 movement MVP — verification

## Image underlay replacing the ellipse — 10 November 2026

This section supersedes the earlier blue-ring implementation below. The ellipse Graphics object and ellipse drawing were removed. The unchanged team-supplied `sculpture2.png` is now an independent Phaser image underneath each exhibit; `sculpture3.png` is a reference only.

The local Chrome check confirmed:

- All four exhibit entries own separate exhibit/highlight images, with the highlight below the exhibit. There is no old ellipse object. The highlight source is byte-identical to the supplied file.
- In all four facings, the northwest, southwest and southeast cases show only their own underlay when the character is completely hidden. The shorter northeast case still leaves visible hat pixels at the closest legal point, so its underlay remains hidden.
- Partial/front exposure, walking out using native keyboard input and reset hide all underlays.
- 1440×1000, 1024×768, 390×844 and 844×390 preserve source-to-world layer alignment.
- A diagnostic replacement of the exhibit texture leaves the highlight as an independent image. It is not baked into the exhibit artwork.
- All collision rectangles match the previous scenery update exactly. No uncaught page errors occurred.

The existing sixteen Node tests still pass. See [underlay browser report](exhibit-underlay-check-report.json), [screenshot](../screenshots/exhibit-hidden-underlay.png) and [replacement instructions](../docs/exhibit-layers.md). These browser checks are not a human playtest. Earlier ring screenshots/reports below are historical evidence of the superseded version.

---

## Scenery and exhibit visibility update — 10 November 2026

This update supersedes the historical pot-only description below: the central plant keeps the full-frame collision requested later on 9 November; the other seven plants remain pot-only. Both benches now collide only at their lower bases. Both lower lamp fixtures occlude without adding bodies; the upper lamps, movement speed, player body, cases and room boundaries are unchanged.

Sixteen Node tests cover movement, alpha selection, compact clipping paths, lower-base-only bench collision and full-character exhibit coverage. The local Chrome check uses a separate 5189 server and diagnostic positions followed by native keyboard input:

- At 1440×1000, 1024×768, 390×844 and 844×390, masked scenery aligns with the source background. One lower-lamp edge pixel differs by a single colour-channel level due to Canvas clipping rounding; no positional shift or opaque floor rectangle is present.
- Both benches cover the player behind their upper art, allow movement through that upper region, block downward travel at their lower base, and do not cover a player in front.
- Both lower lamp fixtures cover player pixels without acquiring physical collision bodies. Their surrounding light remains decorative background.
- All four exhibits were checked in all four facings. The northwest, southwest and southeast cases completely hide the tested character and show a blue ring. The shorter northeast case leaves a few hat pixels visible at the closest legal point and correctly does not claim complete hiding.
- The ring clears for partially exposed/front positions, after walking out with native keyboard input, and on reset. No uncaught page exceptions occurred.

See [the browser report](scenery-check-report.json) and [bench](../screenshots/bench-occlusion.png), [lamp](../screenshots/lower-lamp-occlusion.png) and [blue-ring](../screenshots/exhibit-hidden-ring.png) screenshots. These are automated/browser checks, not a new human playtest. The original source images were preserved. No new commit, push or deployment is part of this change.

---

## Plant foreground update — 9 November 2026

The user clarified that **only pots block movement; leaves are visual occluders**. The eight pot rectangles, all other obstacles, player speed and body dimensions remain unchanged. Eleven automated tests now cover the original movement/configuration checks plus transparent floor rejection, original-colour sampling, empty-guide behaviour and separate foliage/pot geometry.

The local Chrome plant check confirmed:

- Eight nonempty transparent plant regions, each containing both opaque and clear pixels.
- Exact pixel registration: with characters/exhibits hidden for the isolated background comparison, enabling the foreground changes **zero** background pixels at 1440×1000, 1024×768, 390×844 and 844×390 viewports.
- A player behind the central plant is covered by leaves. The same region has no extra occlusion when the player is in front. Screenshots were visually inspected.
- Native downward keyboard movement passes through the foliage area and stops at the original pot collider. Reset still returns to the same spawn.
- No uncaught page exceptions in the successful run. [Detailed plant report](plant-check-report.json).

The first preview attempt encountered an already occupied 5173 port and was discarded; later tests used their own 5187 server. A first cropped-foreground implementation failed pixel registration because the Canvas renderer adds half a pixel to cropped destination sizes. A shared full-size atlas with per-plant clipping fixed the alignment. Comparison fixtures were also restricted to the relevant background or central-plant region so other plants correctly covering exhibits were not mistaken for misalignment. Failed checks were not counted as passes.

The guide was created by built-in image_gen, with runtime original-colour sampling; no Python image editing or camera use was involved. The exported transparent atlas and screenshots are stored in the project. This is automated/browser evidence, not a new human playtest.

---

Date: 9 November 2026. Tests concern the movement-only prototype, not the planned complete game.

## Automated checks actually run

`node --test tests/*.test.mjs`: **7 passed, 0 failed**. Coverage includes equal cardinal/diagonal speed, idle/opposed-key behaviour, latest surviving facing, arrow aliases, 16:9 room/HUD mapping, safe initial spawn, four player sources and four display-case/two-bench configurations.

## Browser checks actually run

Headless installed Chrome, separate E-drive profile, local Vite server and native Playwright keyboard/button events:

- Eight movement combinations checked cardinal/diagonal direction, expected displacement, 220-unit requested speed, the actual displayed texture, no drift after release, and sprite/body feet alignment.
- **27 accessible obstacle-side contacts** checked the four display-case bases, two benches and centre plant. Tests set a diagnostic starting point near each obstacle, then native keys and the actual production Arcade colliders determine contact. These placements are test fixtures, not production movement or a human route trial.
- The right side of the east bench has insufficient room between it and the wall for a legal test start. That probe was excluded and recorded, rather than treating an initially embedded body as a valid approach. Actual room-bound collision still prevents entry beyond the wall.
- All four outer boundaries block travel.
- Tabbing away while a movement key is held stops the player; returning does not leave a stuck key.
- Visible buttons toggle collision outlines and reset to the correct spawn and right-facing texture.
- 1440×1000, 1024×768, 390×844 and 844×390 viewports keep the canvas at 16:9 with pixelated image rendering, no horizontal page overflow, unchanged world position on resize and working subsequent input.
- Blocking `player/down.png` produces readable missing-asset feedback and a reload action.
- No uncaught page exceptions in the successful movement/collision run.

An early build used a Vite chunk-option form unsupported by its current bundler; it was corrected to a function and the production build passed. An initial browser probe placed the player outside the legal gap beside the east bench; the diagnostic setup was corrected as described above. These failed attempts are not counted as successful checks.

Canvas HUD text showed clipping/scaling artifacts during screenshot inspection. Labels were moved into a proportional React overlay, keeping gameplay rendering and physics in Phaser. The desktop screenshot was visually inspected after this correction. The complete browser check was then repeated successfully against the actual `LFG` checkout after its own dependency installation. This is still not a human playtest.

The Windows helper's `-Build` command succeeded in the actual checkout. Vite emitted the expected large-Phaser-chunk warning, but the build completed. The checked-in [browser report](browser-check-report.json) records the final movement, contact and viewport observations. Screenshots are in `screenshots/`.

## Manual review

1. Start with `powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1` and open http://127.0.0.1:5173/.
2. Click the scene; hold W, A, S and D individually. Release each and check the retained facing.
3. Hold two directions together, then release one. The character should not speed up diagonally or jump when facing changes.
4. Approach every case base, both benches, the central pot and room edges. Use F2 to inspect actual occupied-floor rectangles. Tall art can overlap a character standing behind it; that alone does not mean the feet collider passed through its base.
5. Try R, both visible controls, tabbing away during a held key and resizing. Check for drift or stale input.

## Limits

No human playtest is claimed. Physical mobile touch controls, other browsers and long-session frame rates remain unverified or outside this MVP. Plant, bench and lower-lamp foreground masking are covered by the updates above. The same sculpture pose is reused for all four cases. The static route HUD does not implement room progression or alert logic. A large Phaser bundle warning is expected; it is not evidence of a measured runtime performance problem.
