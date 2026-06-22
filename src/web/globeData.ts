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

/** "How far back" slider: keep ancestors whose nearest appearance is within depth. */
export function filterByDepth(ancestors: GlobeAncestor[], maxDepth: number): GlobeAncestor[] {
  return ancestors.filter((a) => a.minDepth <= maxDepth);
}

export function toPoints(ancestors: GlobeAncestor[]): PointDatum[] {
  return placed(ancestors).map((a) => ({
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
export function toArcs(ancestors: GlobeAncestor[], links: GlobeLink[]): ArcDatum[] {
  const byId = new Map(placed(ancestors).map((a) => [a.id, a]));
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

/** Convenience: everything the globe needs for a given depth setting. */
export function buildLayers(ancestors: GlobeAncestor[], links: GlobeLink[], maxDepth: number) {
  const visible = filterByDepth(ancestors, maxDepth);
  return { points: toPoints(visible), arcs: toArcs(visible, links) };
}
