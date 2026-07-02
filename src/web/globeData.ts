// Pure transforms from analysis records into globe.gl layer datasets. No React, no
// WebGL — so this is unit-testable in node, which is where the wiring correctness
// lives. The view layer just renders whatever these return.

import type { GlobeAncestor, GlobeLink } from '../analyze';

export interface PointDatum {
  id: string;
  lat: number;
  lng: number;
  weight: number;
  depth: number;
  isLeaf: boolean;
  label: string;
  /** Modern country — the key the composition-row isolate filter matches against. */
  region: string | null;
}

export interface ArcDatum {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  weight: number;
  /** Generation depth of the parent end — drives arc color (recent vs deep). */
  depth: number;
  /** Great-circle child→parent distance (km) — a long arc is a real migration and
   *  is rendered prominently even when its weight is small. */
  distanceKm: number;
  /** A long-haul migration (>= ARC_LONGHAUL_KM): kept past the weight cull and drawn
   *  bright, because these transoceanic sweeps are the visually striking part. */
  longHaul: boolean;
  /** Parent endpoint's modern country — an arc is "included" by the isolate filter
   *  when this is in the selected set. */
  region: string | null;
}

/** Level-of-detail for arcs. Short, low-weight arcs are crowding (the deep European
 *  fan-out) and pure render cost — cull them below ARC_MIN_WEIGHT. But a LONG arc is a
 *  migration (a transatlantic / transoceanic move), which is sparse AND the striking
 *  part of the picture, so keep it down to a much lower floor regardless of depth.
 *  Markers are never culled — only arcs. (1/2)^depth: gen 9 ≈ 0.002, gen 13 ≈ 0.0001. */
export const ARC_MIN_WEIGHT = 0.002;
export const ARC_LONGHAUL_KM = 1500;
export const ARC_LONGHAUL_MIN_WEIGHT = 0.0001;

/** Great-circle distance in km (haversine). */
function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

type Placed = GlobeAncestor & { lat: number; lng: number };

export function placed(ancestors: GlobeAncestor[]): Placed[] {
  return ancestors.filter((a): a is Placed => a.lat != null && a.lng != null);
}

// --- Overlap declutter ------------------------------------------------------------
// Ancestors born in the same city resolve to the SAME geocode, so their markers stack
// into one unreadable dot. Spread each co-located group on a deterministic golden-angle
// spiral around the shared spot: sub-pixel at the wide view, resolving into distinct
// dots as the camera closes in. The heaviest member keeps the TRUE coordinate (the
// honest anchor); the rest step outward by rank. Pure + deterministic (no randomness),
// computed once per layer build — zero per-frame cost. Arcs are built from the spread
// positions too, so lines land exactly on dots.
export const SPREAD_CELL_DEG = 0.05; // within this, two places are visually "the same spot"
export const SPREAD_STEP_DEG = 0.16; // spiral pitch: rank k sits at ~STEP*sqrt(k) degrees
const GOLDEN_ANGLE = 2.399963229728653;

export function spreadOverlaps(list: Placed[]): Placed[] {
  const cells = new Map<string, number[]>();
  list.forEach((a, i) => {
    const key = `${Math.round(a.lat / SPREAD_CELL_DEG)}:${Math.round(a.lng / SPREAD_CELL_DEG)}`;
    const cell = cells.get(key);
    if (cell) cell.push(i);
    else cells.set(key, [i]);
  });

  const out = list.slice();
  for (const idxs of cells.values()) {
    if (idxs.length < 2) continue; // singletons stay exactly where the record puts them
    const ranked = [...idxs].sort((x, y) => list[y]!.contributionWeight - list[x]!.contributionWeight);
    ranked.forEach((pi, k) => {
      if (k === 0) return; // heaviest keeps the true coordinate
      const a = list[pi]!;
      const r = SPREAD_STEP_DEG * Math.sqrt(k);
      const theta = k * GOLDEN_ANGLE;
      // Divide the lng offset by cos(lat) so the spiral is isotropic on the sphere
      // (clamped away from the poles where the correction blows up).
      const stretch = Math.max(0.2, Math.cos((a.lat * Math.PI) / 180));
      out[pi] = { ...a, lat: a.lat + r * Math.sin(theta), lng: a.lng + (r * Math.cos(theta)) / stretch };
    });
  }
  return out;
}

/** "How far back" slider: keep ancestors whose nearest appearance is within depth. */
export function filterByDepth(ancestors: GlobeAncestor[], maxDepth: number): GlobeAncestor[] {
  return ancestors.filter((a) => a.minDepth <= maxDepth);
}

/** Takes the placed (and already spread) list, so points and arcs share positions. */
export function toPoints(list: Placed[]): PointDatum[] {
  return list.map((a) => ({
    id: a.id,
    lat: a.lat,
    lng: a.lng,
    weight: a.contributionWeight,
    depth: a.minDepth,
    isLeaf: a.isLeaf,
    label: `${a.name} — ${a.birthPlace ?? 'unknown'}${a.birthYear ? ` (${a.birthYear})` : ''}`,
    region: a.modernCountry,
  }));
}

/** Migration arcs: child -> parent, only where both endpoints are placed. Crowded
 *  short arcs are culled by weight; long-haul migrations are kept regardless (see the
 *  ARC_* constants). Markers are never culled. */
export function toArcs(list: Placed[], links: GlobeLink[]): ArcDatum[] {
  const byId = new Map(list.map((a) => [a.id, a]));
  const out: ArcDatum[] = [];
  for (const l of links) {
    const c = byId.get(l.childId);
    const p = byId.get(l.parentId);
    if (!c || !p) continue;
    const dist = distanceKm(c.lat, c.lng, p.lat, p.lng);
    const longHaul = dist >= ARC_LONGHAUL_KM;
    // Keep strong (recent) arcs, OR long migrations down to a much lower floor.
    const keep = p.contributionWeight >= ARC_MIN_WEIGHT
      || (longHaul && p.contributionWeight >= ARC_LONGHAUL_MIN_WEIGHT);
    if (!keep) continue;
    out.push({
      startLat: c.lat, startLng: c.lng, endLat: p.lat, endLng: p.lng,
      weight: p.contributionWeight, depth: p.minDepth, distanceKm: dist, longHaul,
      region: p.modernCountry,
    });
  }
  return out;
}

/** Convenience: everything the globe needs for a given depth setting. Runs once per
 *  depth change (memoized by the caller), so the declutter spread is not a frame cost. */
export function buildLayers(ancestors: GlobeAncestor[], links: GlobeLink[], maxDepth: number) {
  const visible = spreadOverlaps(placed(filterByDepth(ancestors, maxDepth)));
  return { points: toPoints(visible), arcs: toArcs(visible, links) };
}
