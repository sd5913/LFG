export const GAME = Object.freeze({ width: 1600, height: 900 });

// back.png contains a baked HUD above y=90. Only the character-free room
// rectangle below it is used. All map coordinates below refer to that source.
export const BACKGROUND = Object.freeze({
  width: 1670, height: 941, roomTop: 90,
  url: 'assets/room/back.png',
});
export const ROOM_SCALE = GAME.width / BACKGROUND.width;
export const HUD_HEIGHT = GAME.height - (BACKGROUND.height - BACKGROUND.roomTop) * ROOM_SCALE;
export const roomPoint = (x, y) => ({ x: x * ROOM_SCALE, y: HUD_HEIGHT + (y - BACKGROUND.roomTop) * ROOM_SCALE });
export const roomRect = ({ x, y, width, height, ...rest }) => ({
  ...roomPoint(x, y), width: width * ROOM_SCALE, height: height * ROOM_SCALE, ...rest,
});

export const PLAYER = Object.freeze({
  speed: 220, // logical scene pixels per second, independent of facing
  textureSize: 144,
  artHeight: 138,
  bodyWidth: 34,
  bodyHeight: 20,
  // Start on the clear lower portion of the left entrance's red carpet.
  spawn: Object.freeze(roomPoint(120, 610)),
  initialFacing: 'right',
});

// These visible-art bounds ignore the source images' almost-transparent fringe.
// Only texture frames are selected; the original PNG bytes are preserved.
export const PLAYER_ART = Object.freeze({
  up:    { file: 'assets/player/up.png',    bounds: [63, 52, 328, 491], footX: 278 },
  down:  { file: 'assets/player/down.png',  bounds: [88, 35, 270, 500], footX: 253 },
  left:  { file: 'assets/player/left.png',  bounds: [179, 65, 398, 468], footX: 366 },
  right: { file: 'assets/player/right.png', bounds: [103, 65, 398, 468], footX: 314 },
});

export const WALKABLE = Object.freeze(roomRect({ x: 62, y: 195, width: 1546, height: 670 }));

export const DISPLAY_CASES = Object.freeze([
  { id: 'case-nw', x: 405, bottom: 451, width: 280, hiddenFile: 'assets/exhibits/case-nw-hidden.png', hiddenBounds: [347, 209, 843, 606] },
  { id: 'case-ne', x: 1025, bottom: 463, width: 280, hiddenFile: 'assets/exhibits/case-ne-hidden.png', hiddenBounds: [347, 210, 843, 604] },
  { id: 'case-sw', x: 544, bottom: 733, width: 280, hiddenFile: 'assets/exhibits/case-sw-hidden.png', hiddenBounds: [348, 208, 841, 605] },
  { id: 'case-se', x: 1091, bottom: 796, width: 280, hiddenFile: 'assets/exhibits/case-se-hidden.png', hiddenBounds: [346, 209, 845, 605] },
]);

// The treasure presentation sits in the upper-right alcove. Its physical body
// is deliberately only the low plinth: the player can pass visually behind
// the taller display but cannot walk through its base.
export const TREASURE_DISPLAY = Object.freeze({
  id: 'treasure-display', file: 'assets/treasure-display.png',
  x: 1450, bottom: 394, width: 344, height: 229,
  collision: { x: 1286, y: 360, width: 328, height: 34 },
});

export const PLANT_FOREGROUND = Object.freeze({
  guideFile: 'assets/plants/foreground-guide.png',
});

// Foliage frames drive drawing. Only the central plant uses its full frame
// as a collider; the other seven retain their original pot-only collision.
export const PLANTS = Object.freeze([
  { id: 'plant-nw', frame: { x: 56, y: 120, width: 123, height: 152 }, pot: { x: 86, y: 225, width: 56, height: 40 } },
  { id: 'plant-nw-inner', frame: { x: 181, y: 102, width: 137, height: 145 }, pot: { x: 223, y: 200, width: 57, height: 39 } },
  { id: 'plant-ne', frame: { x: 1230, y: 175, width: 138, height: 170 }, pot: { x: 1274, y: 293, width: 61, height: 41 } },
  { id: 'plant-centre', collision: 'full', frame: { x: 674, y: 379, width: 121, height: 244 }, pot: { x: 687, y: 548, width: 89, height: 61 } },
  { id: 'plant-sw', frame: { x: 39, y: 722, width: 132, height: 164 }, pot: { x: 74, y: 824, width: 57, height: 49 } },
  { id: 'plant-south-west', frame: { x: 577, y: 788, width: 118, height: 146 }, pot: { x: 611, y: 875, width: 58, height: 45 } },
  { id: 'plant-south-east', frame: { x: 966, y: 789, width: 123, height: 145 }, pot: { x: 1003, y: 875, width: 59, height: 45 } },
  { id: 'plant-se', frame: { x: 1489, y: 717, width: 134, height: 169 }, pot: { x: 1511, y: 824, width: 60, height: 49 } },
]);

// The upper artwork occludes the player; only each bench's lower base blocks feet.
export const BENCHES = Object.freeze([
  { id: 'bench-west', kind: 'bench', frame: { x: 214, y: 492, width: 189, height: 89 }, base: { x: 225, y: 544, width: 166, height: 30 } },
  { id: 'bench-east', kind: 'bench', frame: { x: 1509, y: 507, width: 81, height: 168 }, base: { x: 1520, y: 636, width: 58, height: 28 } },
]);

// Only the two lower fixtures become foreground. Their soft baked light stays
// on the background; neither fixtures nor light halos create physical bodies.
export const BOTTOM_LIGHTS = Object.freeze([
  { id: 'light-south-west', kind: 'lamp', frame: { x: 493, y: 844, width: 57, height: 56 } },
  { id: 'light-south-east', kind: 'lamp', frame: { x: 1120, y: 844, width: 57, height: 56 } },
]);

export const SCENERY = Object.freeze([...BENCHES, ...BOTTOM_LIGHTS]);

// Feet collide with furniture bases, except the explicitly full-height central plant.
export const OBSTACLES = Object.freeze([
  ...BENCHES.map(({ id, base }) => roomRect({ id, ...base })),
  ...PLANTS.map(({ id, pot, frame, collision }) => roomRect({ id, ...(collision === 'full' ? frame : pot) })),
  ...DISPLAY_CASES.map(item => roomRect({
    id: item.id,
    x: item.x - item.width / 2 + 7,
    y: item.bottom - 34,
    width: item.width - 14,
    height: 34,
  })),
  roomRect({ id: TREASURE_DISPLAY.id, ...TREASURE_DISPLAY.collision }),
]);

export const SCULPTURE_ART = Object.freeze({
  file: 'assets/exhibits/sculpture.png', bounds: [348, 211, 841, 602],
});

// Independent underlay: registration describes the exhibit rectangle in this
// highlight image's source canvas. Keep this asset separate when replacing art.
export const EXHIBIT_HIGHLIGHT_ART = Object.freeze({
  file: 'assets/exhibits/sculpture2.png', registration: [348, 211, 841, 602],
});
