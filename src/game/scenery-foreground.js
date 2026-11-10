// Code-native foreground rendering from the original source pixels. The tight
// frames and palette separate furniture/fixtures from the blue-grey floor;
// no generated replacement artwork or rectangular floor patches are drawn.
export function isSceneryPixel(r, g, b, kind) {
  const outline = r < 48 && g < 85 && b < 103;
  const warm = r > 90 && r > g + 12 && g > b + 8;
  const bulb = kind === 'lamp' && r > 190 && g > 170 && b > 115;
  return outline || warm || bulb;
}

export function sceneryPixels(source, imageWidth, imageHeight, { frame, kind }) {
  const output = new Uint8ClampedArray(frame.width * frame.height * 4);
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const sx = frame.x + x, sy = frame.y + y;
    if (sx < 0 || sx >= imageWidth || sy < 0 || sy >= imageHeight) continue;
    if (kind === 'lamp') {
      // Stepped fixture silhouette: exclude the surrounding circular glow and
      // the wall's horizontal dark line, which share the lamp's warm palette.
      const halfWidth = y < 6 || y >= 54 ? -1 : y < 10 ? 14 : y < 14 ? 18 :
        y < 35 ? 22 : y < 45 ? 13 : 7;
      if (Math.abs(x - frame.width / 2) > halfWidth) continue;
    }
    const from = (sy * imageWidth + sx) * 4;
    if (kind !== 'lamp' && !isSceneryPixel(source[from], source[from + 1], source[from + 2], kind)) continue;
    const to = (y * frame.width + x) * 4;
    output[to] = source[from]; output[to + 1] = source[from + 1];
    output[to + 2] = source[from + 2]; output[to + 3] = 255;
  }
  return output;
}

// Merge identical horizontal alpha runs across adjacent rows. These compact
// rectangles form a Canvas clipping path over the original room texture,
// avoiding resampling fringes from a separately filtered transparent image.
export function opaqueRectangles(rgba, width, height) {
  const rectangles = []; let previous = new Map();
  for (let y = 0; y < height; y++) {
    const row = new Map();
    for (let x = 0; x < width;) {
      if (!rgba[(y * width + x) * 4 + 3]) { x++; continue; }
      const start = x;
      while (x < width && rgba[(y * width + x) * 4 + 3]) x++;
      const key = `${start}:${x}`;
      const rect = previous.get(key) ?? { x: start, y, width: x - start, height: 0 };
      if (!previous.has(key)) rectangles.push(rect);
      rect.height++; row.set(key, rect);
    }
    previous = row;
  }
  return rectangles;
}
