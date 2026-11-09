# Movement MVP asset inspection

Inspection date: 9 November 2026. Supplied assets are located in the team's `assignment4/sucai` folder outside the repository. Runtime copies below preserve their original bytes. Hashes and image dimensions are listed in [asset-manifest.json](public/assets/asset-manifest.json).

| Original | Dimensions | Alpha inspection | Use |
| --- | --- | --- | --- |
| `back.png` | 1670 × 941 | RGB, opaque background | Room texture frame at y=90; original baked HUD excluded |
| `image 46.png` | 680 × 591 | RGBA, transparent pixels present | Player facing right |
| `image 47.png` | 494 × 563 | RGBA, transparent pixels present | Player facing down |
| `image 48.png` | 540 × 591 | RGBA, transparent pixels present | Player facing up |
| `image 49.png` | 680 × 591 | RGBA, transparent pixels present | Player facing left |
| `sculpture.png` | 1536 × 1024 | RGBA, transparent pixels present | Four separate, reused exhibit sprites |

The source character canvases and feet baselines differ. `PLAYER_ART` records visible-art bounds and feet-x values; the runtime draws them into a common 144 × 144 transparent texture, with 138-pixel art height and a shared bottom-centre feet position. Almost-transparent fringe outside those rectangles is not sampled. No exported PNG is repainted or background-flattened.

The room portion of `back.png` has no fixed gameplay player, guard or vision cone. A small character marker in its top HUD is excluded together with the whole baked HUD. Plants and benches receive independent floor colliders. Plants additionally have transparent foreground layers so their leaves can cover the player. Four separate copies of the supplied transparent exhibit are added to match the reference's main obstruction layout.

## Plant foreground addition

The built-in image_gen tool extracted an eight-plant transparent alpha guide from `back.png`. The guide is saved in `public/assets/plants/foreground-guide.png` (1670 × 942 RGBA). It is used for selection, not to repaint generated colours over the original art. At load time, the guide is mapped to the source dimensions, floor-coloured pixels are rejected, and the original room RGB is copied into a shared transparent atlas. Eight geometry-clipped instances use exactly the background's drawing transform to avoid pixel drift.

`public/assets/plants/foreground.png` is an exported transparent copy of that original-colour atlas (1670 × 851, excluding the original top 90 rows), provided for inspection and reuse. The game constructs the same layer at runtime. Each plant's sort depth follows the pot bottom; its drawing frame is separate from its unchanged collision rectangle. The prompt and processing decisions are recorded in [docs/plant-foreground.md](docs/plant-foreground.md).

## Inspected but not used

- Guard right/front/back/left: `image 50.png`, `image 55.png`, `image 56.png`, `image 58.png`. All have real transparency; patrols are outside this stage.
- `sucai/final` is a PNG without a filename extension and contains the composed scene, fixed characters and cone. It is a reference only and is not loaded or bundled.
- The earlier `art-reference` concepts and `Stealth_Game_UI_Kit_Full_Package (1).zip` are not required by this implementation. The ZIP was listed for inspection, not installed or executed.

There is no blocking player/background asset gap for this MVP: all four player directions are transparent, and a character-free room frame can be selected without using the composite gameplay picture. Plant foregrounds are now implemented. Bench foreground masks and additional exhibit poses remain separate needs.
