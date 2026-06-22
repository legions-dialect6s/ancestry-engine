// Design tokens — a cold cockpit/geoscape palette, deliberate (not a default).
// Warm scanner-amber as the primary readout (ME1 / XCOM HUD), cold cyan for active
// state and atmosphere. Condensed sans for labels, mono for data. CC tunes from here.

export const theme = {
  bg: '#070B12',          // void
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

// Compose an rgba() string from a theme hex token + alpha, so layers can derive
// translucent variants (faint fills, hairline strokes) without inventing new hues.
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
