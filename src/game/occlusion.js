// Cache solid player samples and exhibit alpha once, never read canvas pixels
// during movement. Transparent texture padding is not part of the character.
export function alphaMask(rgba, width, height) {
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  return { alpha, width, height };
}

export function solidSamples(mask, threshold = 200) {
  const points = [];
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
    if (mask.alpha[y * mask.width + x] >= threshold) points.push(x + 0.5, y + 0.5);
  }
  return new Float32Array(points);
}

export function fullyCovered(points, player, mask, exhibit) {
  if (!points.length || exhibit.depth <= player.depth) return false;
  for (let i = 0; i < points.length; i += 2) {
    const worldX = player.x + points[i] * player.scaleX;
    const worldY = player.y + points[i + 1] * player.scaleY;
    const x = Math.floor((worldX - exhibit.x) / exhibit.scaleX);
    const y = Math.floor((worldY - exhibit.y) / exhibit.scaleY);
    if (x < 0 || y < 0 || x >= mask.width || y >= mask.height ||
        mask.alpha[y * mask.width + x] < 240) return false;
  }
  return true;
}
