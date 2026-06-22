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
}

export interface ArcDatum {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  weight: number;
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
  }));
}

/** Migration arcs: child -> parent, only where both endpoints are placed. */
export function toArcs(ancestors: GlobeAncestor[], links: GlobeLink[]): ArcDatum[] {
  const byId = new Map(placed(ancestors).map((a) => [a.id, a]));
  const out: ArcDatum[] = [];
  for (const l of links) {
    const c = byId.get(l.childId);
    const p = byId.get(l.parentId);
    if (c && p) out.push({ startLat: c.lat, startLng: c.lng, endLat: p.lat, endLng: p.lng, weight: p.contributionWeight });
  }
  return out;
}

/** Convenience: everything the globe needs for a given depth setting. */
export function buildLayers(ancestors: GlobeAncestor[], links: GlobeLink[], maxDepth: number) {
  const visible = filterByDepth(ancestors, maxDepth);
  return { points: toPoints(visible), arcs: toArcs(visible, links) };
}
