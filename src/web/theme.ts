// Design tokens — a cold cockpit/geoscape palette, deliberate (not a default).
// Warm scanner-amber as the primary readout (ME1 / XCOM HUD), cold cyan for active
// state and atmosphere. Condensed sans for labels, mono for data. CC tunes from here.

export const theme = {
  bg: '#03050B',          // void — deep near-black so the globe + arcs pop
  panel: 'rgba(10,15,26,0.82)',
  panelEdge: '#1E2A3A',
  accentAmber: '#E8A33D',  // primary readout / leaves
  accentCyan: '#5FD0E0',   // active / atmosphere / interior nodes
  text: '#C7D2E0',
  textDim: '#6B7A8D',
  warn: '#C8633A',         // uncertainty
  fontLabel: '"Saira Condensed", system-ui, sans-serif',
  fontData: '"IBM Plex Mono", ui-monospace, monospace',
} as const;

// Angular HUD panel frame (clipped corners), the geoscape chrome motif.
export const panelClip = 'polygon(0 10px, 10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

// Compose an rgba() string from a theme hex token + alpha, so layers can derive
// translucent variants (faint fills, hairline strokes) without inventing new hues.
export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Linear blend between two theme hex tokens (t clamped 0..1). Used to grade arcs from
// warm/recent to cool/deep across the two accent hues — no new colors invented.
export function mix(hexA: string, hexB: string, t: number): string {
  const k = Math.max(0, Math.min(1, t));
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, '0');
  return `#${ch(a.r, b.r)}${ch(a.g, b.g)}${ch(a.b, b.b)}`;
}
