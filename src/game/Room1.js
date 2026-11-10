import Phaser from 'phaser';
import { BACKGROUND, DISPLAY_CASES, EXHIBIT_HIGHLIGHT_ART, GAME, HUD_HEIGHT, OBSTACLES, PLAYER, PLAYER_ART, PLANTS, PLANT_FOREGROUND, ROOM_SCALE, SCENERY, SCULPTURE_ART, TREASURE_DISPLAY, WALKABLE, roomPoint } from './config.js';
import { KEY_DIRECTIONS, movementIntent } from './movement.js';
import { plantPixels } from './plant-foreground.js';
import { sceneryPixels, opaqueRectangles } from './scenery-foreground.js';
import { alphaMask, solidSamples, fullyCovered } from './occlusion.js';

export default class Room1 extends Phaser.Scene {
  constructor(onState) {
    super('Room1');
    this.onState = onState;
    this.pressed = new Set();
    this.pressOrder = [];
    this.facing = PLAYER.initialFacing;
    this.debugVisible = false;
    this.failedAssets = [];
  }

  preload() {
    const base = import.meta.env.BASE_URL;
    this.load.image('room-source', base + BACKGROUND.url);
    this.load.image('case-source', base + SCULPTURE_ART.file);
    this.load.image('case-highlight-source', base + EXHIBIT_HIGHLIGHT_ART.file);
    for (const item of DISPLAY_CASES) this.load.image(`${item.id}-hidden`, base + item.hiddenFile);
    this.load.image('treasure-display', base + TREASURE_DISPLAY.file);
    this.load.image('plant-guide', base + PLANT_FOREGROUND.guideFile);
    for (const [direction, art] of Object.entries(PLAYER_ART)) {
      this.load.image(`source-${direction}`, base + art.file);
    }
    this.load.on('loaderror', file => this.failedAssets.push(file.key));
  }

  create() {
    if (this.failedAssets.length) {
      this.onState({ ready: false, error: `素材加载失败：${this.failedAssets.join('、')}。请刷新或检查 assets 文件夹。` });
      return;
    }
    this.createTextures();
    this.add.image(0, HUD_HEIGHT, 'room-source', 'room-only').setOrigin(0)
      .setScale(ROOM_SCALE).setDepth(-10000);
    this.drawHud();
    this.createPlantLayers();
    this.createSceneryLayers();

    this.exhibits = [];
    for (const item of DISPLAY_CASES) {
      const p = roomPoint(item.x, item.bottom);
      const width = item.width * ROOM_SCALE;
      const image = this.add.image(p.x, p.y, 'case-source', 'case-only').setOrigin(0.5, 1)
        .setDisplaySize(width, width * SCULPTURE_ART.bounds[3] / SCULPTURE_ART.bounds[2])
        .setDepth(p.y);
      // Independent source-aligned image behind the exhibit, not a flattened
      // highlighted copy. Full source canvas retains the supplied border/dots.
      const highlight = this.add.image(0, 0, 'case-highlight-source').setOrigin(0)
        .setVisible(false).setName(`${item.id}-underlay`);
      this.alignExhibitHighlight(image, highlight);
      this.exhibits.push({
        id: item.id, image, highlight,
        hiddenTexture: `${item.id}-hidden`,
        displayWidth: image.displayWidth, displayHeight: image.displayHeight,
      });
    }
    const treasure = roomPoint(TREASURE_DISPLAY.x, TREASURE_DISPLAY.bottom);
    this.treasureDisplay = this.add.image(treasure.x, treasure.y, 'treasure-display').setOrigin(0.5, 1)
      .setDisplaySize(TREASURE_DISPLAY.width * ROOM_SCALE, TREASURE_DISPLAY.height * ROOM_SCALE)
      .setDepth(treasure.y);
    this.hiddenExhibitId = null;

    this.blockers = this.physics.add.staticGroup();
    for (const obstacle of OBSTACLES) {
      const object = this.add.rectangle(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2,
        obstacle.width, obstacle.height, 0xffffff, 0);
      object.setData('obstacleId', obstacle.id);
      this.blockers.add(object);
    }
    this.physics.world.setBounds(WALKABLE.x, WALKABLE.y, WALKABLE.width, WALKABLE.height);
    this.player = this.physics.add.sprite(PLAYER.spawn.x, PLAYER.spawn.y, `player-${this.facing}`)
      .setOrigin(0.5, 1).setCollideWorldBounds(true);
    this.player.body.setSize(PLAYER.bodyWidth, PLAYER.bodyHeight, false)
      .setOffset((PLAYER.textureSize - PLAYER.bodyWidth) / 2, PLAYER.textureSize - PLAYER.bodyHeight);
    this.player.body.setAllowGravity(false);
    this.player.setPushable(false);
    this.collider = this.physics.add.collider(this.player, this.blockers);
    this.debugGraphics = this.add.graphics().setDepth(20000);
    this.installInput();
    this.publish({ ready: true, error: '', facing: this.facing, moving: false, debug: false, hiddenExhibitId: null });
  }

  createTextures() {
    this.textures.get('room-source').add('room-only', 0, 0, BACKGROUND.roomTop,
      BACKGROUND.width, BACKGROUND.height - BACKGROUND.roomTop);
    this.textures.get('case-source').add('case-only', 0, ...SCULPTURE_ART.bounds);
    // Trim each replacement to its real opaque bounds once at load time. This
    // gives it the exact same fixed on-screen rectangle as the original case,
    // without mutating a Game Object while the player is moving.
    for (const item of DISPLAY_CASES) {
      this.textures.get(`${item.id}-hidden`).add('case-only', 0, ...item.hiddenBounds);
    }
    this.createPlantAtlas();
    this.createSceneryShapes();
    this.playerSamples = {};
    for (const [direction, art] of Object.entries(PLAYER_ART)) {
      const texture = this.textures.createCanvas(`player-${direction}`, PLAYER.textureSize, PLAYER.textureSize);
      const context = texture.getContext();
      context.imageSmoothingEnabled = false;
      const [x, y, width, height] = art.bounds;
      const scale = PLAYER.artHeight / height;
      context.drawImage(this.textures.get(`source-${direction}`).getSourceImage(), x, y, width, height,
        PLAYER.textureSize / 2 - (art.footX - x) * scale,
        PLAYER.textureSize - PLAYER.artHeight, width * scale, PLAYER.artHeight);
      texture.refresh();
      texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.playerSamples[direction] = solidSamples(alphaMask(
        context.getImageData(0, 0, PLAYER.textureSize, PLAYER.textureSize).data,
        PLAYER.textureSize, PLAYER.textureSize));
    }
    const [x, y, width, height] = SCULPTURE_ART.bounds;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(this.textures.get('case-source').getSourceImage(), x, y, width, height, 0, 0, width, height);
    this.exhibitAlpha = alphaMask(context.getImageData(0, 0, width, height).data, width, height);
  }

  createSceneryShapes() {
    const { width, height } = BACKGROUND;
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = width; sourceCanvas.height = height;
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    sourceContext.drawImage(this.textures.get('room-source').getSourceImage(), 0, 0);
    const source = sourceContext.getImageData(0, 0, width, height).data;
    this.sceneryShapes = new Map();
    for (const item of SCENERY) {
      const pixels = sceneryPixels(source, width, height, item);
      this.sceneryShapes.set(item.id, opaqueRectangles(pixels, item.frame.width, item.frame.height));
    }
  }

  createSceneryLayers() {
    const masks = [];
    this.sceneryLayers = SCENERY.map(({ id, frame, base }) => {
      const graphics = this.make.graphics({ x: 0, y: 0 }, false);
      graphics.fillStyle(0xffffff);
      for (const rect of this.sceneryShapes.get(id)) {
        const corner = roomPoint(frame.x + rect.x, frame.y + rect.y);
        graphics.fillRect(corner.x, corner.y, rect.width * ROOM_SCALE, rect.height * ROOM_SCALE);
      }
      const mask = graphics.createGeometryMask();
      masks.push({ graphics, mask });
      return this.add.image(0, HUD_HEIGHT, 'room-source', 'room-only').setOrigin(0)
        .setScale(ROOM_SCALE).setMask(mask)
        .setDepth(roomPoint(0, base ? base.y + base.height : frame.y + frame.height).y)
        .setName(id);
    });
    this.events.once('shutdown', () => {
      for (const { graphics, mask } of masks) { mask.destroy(); graphics.destroy(); }
    });
  }

  createPlantAtlas() {
    const { width, height, roomTop } = BACKGROUND;
    const readImage = image => {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, width, height);
      return context.getImageData(0, 0, width, height).data;
    };
    const source = readImage(this.textures.get('room-source').getSourceImage());
    const guide = readImage(this.textures.get('plant-guide').getSourceImage());
    const atlas = this.textures.createCanvas('plant-foreground', width, height - roomTop);
    const context = atlas.getContext();
    for (const { frame } of PLANTS) {
      const image = context.createImageData(frame.width, frame.height);
      image.data.set(plantPixels(source, guide, width, height, frame));
      context.putImageData(image, frame.x, frame.y - roomTop);
    }
    atlas.refresh();
    atlas.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  createPlantLayers() {
    this.plantMasks = [];
    this.plantLayers = PLANTS.map(({ id, frame, pot }) => {
      // Canvas crop rendering adds a half-pixel to each destination rectangle.
      // Draw the shared full-size atlas with the background's exact transform,
      // then clip to this plant, so a cropped plant cannot acquire a new scale.
      const corner = roomPoint(frame.x, frame.y);
      const graphics = this.make.graphics({ x: 0, y: 0 }, false);
      graphics.fillStyle(0xffffff).fillRect(corner.x - 1, corner.y - 1,
        frame.width * ROOM_SCALE + 2, frame.height * ROOM_SCALE + 2);
      const mask = graphics.createGeometryMask();
      this.plantMasks.push({ graphics, mask });
      return this.add.image(0, HUD_HEIGHT, 'plant-foreground').setOrigin(0)
        .setScale(ROOM_SCALE)
        .setMask(mask)
        .setDepth(roomPoint(0, pot.y + pot.height).y)
        .setName(id).setData('plantId', id);
    });
    this.events.once('shutdown', () => {
      for (const { graphics, mask } of this.plantMasks) { mask.destroy(); graphics.destroy(); }
    });
  }

  drawHud() {
    const graphics = this.add.graphics().setDepth(10000);
    graphics.fillStyle(0x0b202a).fillRect(0, 0, GAME.width, HUD_HEIGHT);
    graphics.lineStyle(3, 0xc7aa71).lineBetween(22, HUD_HEIGHT - 5, GAME.width - 22, HUD_HEIGHT - 5);
    const start = GAME.width - 506;
    graphics.lineStyle(3, 0x6b827e).lineBetween(start, 36, start + 270, 36);
    for (let i = 0; i < 3; i++) {
      const x = start + i * 135;
      graphics.fillStyle(i === 0 ? 0xc7aa71 : 0x304854).fillRect(x - 12, 24, 24, 24);
      graphics.lineStyle(2, i === 0 ? 0xf3dcaa : 0x637e86).strokeRect(x - 12, 24, 24, 24);
    }
    // React overlays the HUD labels so text stays readable at fractional FIT
    // scales while the room and sprite images retain nearest-neighbour sampling.
  }

  installInput() {
    const canvas = this.game.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', '第一间博物馆房间。WASD 或方向键移动，F2 显示碰撞框，R 回到起点。');
    this.focusCanvas = () => canvas.focus({ preventScroll: true });
    this.keyDown = event => {
      if (document.activeElement !== canvas || event.ctrlKey || event.metaKey || event.altKey) return;
      if (KEY_DIRECTIONS[event.code]) {
        event.preventDefault();
        if (!this.pressed.has(event.code)) this.pressOrder.push(event.code);
        this.pressed.add(event.code);
      } else if (event.code === 'F2' && !event.repeat) {
        event.preventDefault(); this.toggleDebug();
      } else if (event.code === 'KeyR' && !event.repeat) {
        event.preventDefault(); this.resetPlayer();
      }
    };
    this.keyUp = event => {
      this.pressed.delete(event.code);
      this.pressOrder = this.pressOrder.filter(code => code !== event.code);
      if (!this.pressed.size) this.player.setVelocity(0, 0);
    };
    this.clearInput = () => {
      this.pressed.clear(); this.pressOrder = []; this.player.setVelocity(0, 0);
      this.publish({ moving: false });
    };
    this.visibilityChanged = () => { if (document.hidden) this.clearInput(); };
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.clearInput);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    canvas.addEventListener('blur', this.clearInput);
    canvas.addEventListener('pointerdown', this.focusCanvas);
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', this.keyDown);
      window.removeEventListener('keyup', this.keyUp);
      window.removeEventListener('blur', this.clearInput);
      document.removeEventListener('visibilitychange', this.visibilityChanged);
      canvas.removeEventListener('blur', this.clearInput);
      canvas.removeEventListener('pointerdown', this.focusCanvas);
    });
    if (document.activeElement === document.body) this.focusCanvas();
  }

  resetPlayer() {
    if (!this.player) return;
    this.clearInput();
    this.player.body.reset(PLAYER.spawn.x, PLAYER.spawn.y);
    this.facing = PLAYER.initialFacing;
    this.player.setTexture(`player-${this.facing}`);
    this.publish({ facing: this.facing, moving: false });
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    this.publish({ debug: this.debugVisible });
  }

  publish(partial) {
    const next = { ...this.lastState, ...partial };
    if (JSON.stringify(next) !== JSON.stringify(this.lastState)) {
      this.lastState = next; this.onState(next);
    }
  }

  update() {
    if (!this.player) return;
    const input = movementIntent(this.pressed, this.pressOrder, PLAYER.speed, this.facing);
    this.player.setVelocity(input.vx, input.vy);
    if (input.facing !== this.facing) {
      this.facing = input.facing;
      this.player.setTexture(`player-${this.facing}`);
    }
    this.player.setDepth(this.player.y);
    this.updateExhibitHint();
    this.publish({ facing: this.facing, moving: input.vx !== 0 || input.vy !== 0 });
    this.drawDebug();
  }

  updateExhibitHint() {
    const key = `${this.player.x},${this.player.y},${this.facing}`;
    if (key === this.lastOcclusionKey) return;
    this.lastOcclusionKey = key;
    const player = { x: this.player.x - PLAYER.textureSize / 2,
      y: this.player.y - PLAYER.textureSize, scaleX: 1, scaleY: 1, depth: this.player.depth };
    const points = this.playerSamples[this.facing];
    const hidden = this.exhibits.find(({ image }) => {
      const bounds = image.getBounds();
      // Reject distant cases before examining the cached alpha samples.
      if (player.x > bounds.right || player.x + PLAYER.textureSize < bounds.left ||
          player.y > bounds.bottom || player.y + PLAYER.textureSize < bounds.top) return false;
      return fullyCovered(points, player, this.exhibitAlpha, {
        x: bounds.x, y: bounds.y, scaleX: image.displayWidth / this.exhibitAlpha.width,
        scaleY: image.displayHeight / this.exhibitAlpha.height, depth: image.depth,
      });
    });
    const hiddenExhibitId = hidden?.id ?? null;
    const hiddenChanged = hiddenExhibitId !== this.hiddenExhibitId;
    this.hiddenExhibitId = hiddenExhibitId;
    for (const exhibit of this.exhibits) {
      this.setExhibitHidden(exhibit, exhibit === hidden);
    }
    if (hiddenChanged) this.publish({ hiddenExhibitId });
  }

  setExhibitHidden(exhibit, hidden) {
    const { image } = exhibit;
    const usesHiddenArt = image.texture.key === exhibit.hiddenTexture;
    if (hidden && !usesHiddenArt) {
      image.setTexture(exhibit.hiddenTexture, 'case-only')
        .setDisplaySize(exhibit.displayWidth, exhibit.displayHeight);
    } else if (!hidden && usesHiddenArt) {
      image.setTexture('case-source', 'case-only')
        .setDisplaySize(exhibit.displayWidth, exhibit.displayHeight);
    }
    image.setAlpha(hidden ? 0.85 : 1);
    this.alignExhibitHighlight(image, exhibit.highlight);
    exhibit.highlight.setVisible(hidden);
  }

  alignExhibitHighlight(image, highlight) {
    const bounds = image.getBounds();
    const [x, y, width, height] = EXHIBIT_HIGHLIGHT_ART.registration;
    const scaleX = bounds.width / width, scaleY = bounds.height / height;
    highlight.setPosition(bounds.x - x * scaleX, bounds.y - y * scaleY)
      .setScale(scaleX, scaleY).setDepth(image.depth - 0.1);
  }

  drawDebug() {
    this.debugGraphics.clear();
    if (!this.debugVisible) return;
    this.debugGraphics.lineStyle(2, 0x71e4dc, 0.95).strokeRect(WALKABLE.x, WALKABLE.y, WALKABLE.width, WALKABLE.height);
    this.debugGraphics.fillStyle(0xf7ad65, 0.22).lineStyle(2, 0xf7ad65, 0.9);
    for (const rect of OBSTACLES) this.debugGraphics.fillRect(rect.x, rect.y, rect.width, rect.height).strokeRect(rect.x, rect.y, rect.width, rect.height);
    const body = this.player.body;
    this.debugGraphics.lineStyle(2, 0x8aff9f).strokeRect(body.x, body.y, body.width, body.height);
    this.debugGraphics.fillStyle(0xffffff).fillCircle(this.player.x, this.player.y, 3);
  }
}
