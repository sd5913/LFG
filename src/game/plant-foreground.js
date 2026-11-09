// Use the generated alpha guide for segmentation, but always sample colour
// from the unchanged room. This prevents a regenerated plant being painted
// slightly out of register over the plant already present in the background.
export function isPlantPixel(r, g, b) {
  const outline = r < 48 && g < 88 && b < 100;
  const foliage = g > b + 2 && g >= r * 0.95 && r >= b - 25;
  const terracotta = r > 100 && r > g + 8 && g > b + 8;
  return outline || foliage || terracotta;
}

export function plantPixels(source, guide, imageWidth, imageHeight, frame) {
  const output = new Uint8ClampedArray(frame.width * frame.height * 4);
  const hasGuide = (x, y) => {
    // Two source pixels of tolerance cover the generated matte's edge without
    // turning its slightly larger outline into opaque floor around the leaves.
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const px = x + dx, py = y + dy;
      if (px >= 0 && px < imageWidth && py >= 0 && py < imageHeight &&
          guide[(py * imageWidth + px) * 4 + 3] >= 32) return true;
    }
    return false;
  };
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const sx = frame.x + x, sy = frame.y + y;
    if (sx < 0 || sx >= imageWidth || sy < 0 || sy >= imageHeight) continue;
    const from = (sy * imageWidth + sx) * 4;
    const r = source[from], g = source[from + 1], b = source[from + 2];
    if (!isPlantPixel(r, g, b) || !hasGuide(sx, sy)) continue;
    const to = (y * frame.width + x) * 4;
    output[to] = r; output[to + 1] = g; output[to + 2] = b; output[to + 3] = 255;
  }
  return output;
}
