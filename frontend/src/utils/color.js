/** Assombrit (ratio < 0) ou eclaircit (ratio > 0) une couleur hexadecimale. */
export function shade(hex, ratio) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!match) return hex;

  const value = parseInt(match[1], 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];

  const adjusted = channels.map((channel) => {
    const target = ratio < 0 ? 0 : 255;
    const next = Math.round(channel + (target - channel) * Math.abs(ratio));
    return Math.max(0, Math.min(255, next));
  });

  return `#${adjusted.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Applique la couleur du restaurant aux variables CSS globales. */
export function applyBrandColor(color) {
  if (!color) return;
  document.documentElement.style.setProperty('--brand', color);
  document.documentElement.style.setProperty('--brand-dark', shade(color, -0.25));
}
