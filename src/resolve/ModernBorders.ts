// Modern country borders as a resolve-stage utility: "which present-day country does
// this point fall in?" plus a conservative country-name canonicalizer. Used to
// sanity-check coordinates embedded in a GEDCOM against the country named in the place
// string — FamilySearch sometimes attaches a garbage MAP coord to a correct place
// string ("Newark, …, Scotland" carrying a point in India).
//
// Source is the same vendored Natural Earth 110m admin-0 set the web renders; it lives
// here (the lower layer) and the web re-exports it, so the resolver never imports from
// the view layer. @turf/boolean-point-in-polygon is already a dependency.

import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import raw from './assets/countries-110m.json';

export type CountryFeature = Feature<Polygon | MultiPolygon, { name: string }>;

export const WORLD_COUNTRIES: CountryFeature[] = (
  raw as unknown as { features: CountryFeature[] }
).features;

function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim();
}

// Modern-country aliases for coordinate validation ONLY. Deliberately excludes
// historical polity names (Prussia, Bohemia, "British Colonial America", …): those
// legitimately span today's borders, so a coord inside them must never be rejected.
// Only names that map cleanly to exactly one present-day country belong here. The
// values are the normalized Natural Earth name so both sides of a comparison agree.
const MODERN_ALIAS: Record<string, string> = {
  scotland: 'united kingdom',
  england: 'united kingdom',
  wales: 'united kingdom',
  'northern ireland': 'united kingdom',
  'great britain': 'united kingdom',
  britain: 'united kingdom',
  'united kingdom': 'united kingdom',
  uk: 'united kingdom',
  'united states': 'united states',
  'united states of america': 'united states',
  usa: 'united states',
  us: 'united states',
};

function bboxOf(geom: Polygon | MultiPolygon): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (a: unknown): void => {
    if (typeof (a as number[])[0] === 'number') {
      const [x, y] = a as [number, number];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    } else {
      for (const c of a as unknown[]) visit(c);
    }
  };
  visit(geom.coordinates);
  return [minX, minY, maxX, maxY];
}

// Country pairs that must NOT count as a contradiction — shared territory or naming
// ambiguity. "Belfast, Ireland" with a point in Northern Ireland resolves to the UK
// polygon, but that's the island-vs-state ambiguity, not a garbage coordinate.
const COMPATIBLE: ReadonlyArray<readonly [string, string]> = [['united kingdom', 'ireland']];

export class ModernBorders {
  private readonly features: CountryFeature[];
  private readonly bboxes: Array<[number, number, number, number]>;
  private readonly knownNames: Set<string>;

  constructor(features: CountryFeature[]) {
    this.features = features;
    this.bboxes = features.map((f) => bboxOf(f.geometry));
    this.knownNames = new Set(features.map((f) => norm(f.properties.name)));
  }

  /** Canonical comparison key for a country name from either side (a place-string
   *  token or a Natural Earth polygon name). Returns null for unknown or historical
   *  names so the caller stays conservative and keeps the coordinate. */
  canonical(name: string | null | undefined): string | null {
    if (!name) return null;
    const n = norm(name);
    if (!n) return null;
    if (MODERN_ALIAS[n]) return MODERN_ALIAS[n];
    if (this.knownNames.has(n)) return n;
    return null;
  }

  /** Modern country (Natural Earth name) the point falls in, or null (ocean / gap in
   *  the coarse 110m borders). Bbox pre-filter keeps this cheap at tree scale. */
  countryAt(lat: number, lng: number): string | null {
    for (let i = 0; i < this.features.length; i++) {
      const b = this.bboxes[i]!;
      if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
      const f = this.features[i]!;
      if (booleanPointInPolygon([lng, lat], f)) return f.properties.name;
    }
    return null;
  }

  private compatible(a: string, b: string): boolean {
    return a === b || COMPATIBLE.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
  }

  /** Does this point clearly contradict the country named in the place string? Returns
   *  the point's country (for provenance). Conservative: only true when both are known
   *  modern countries, different, and not a compatible (shared-territory) pair — so
   *  historical/unmatched names and ambiguous points are left trusted. */
  contradicts(stringCountry: string | null, lat: number, lng: number): { contradicts: boolean; pointCountry: string | null } {
    const stringCanon = this.canonical(stringCountry);
    if (!stringCanon) return { contradicts: false, pointCountry: null };
    const pointCountry = this.countryAt(lat, lng);
    const pointCanon = this.canonical(pointCountry);
    if (!pointCanon) return { contradicts: false, pointCountry };
    return { contradicts: !this.compatible(stringCanon, pointCanon), pointCountry };
  }
}

/** Shared instance over the vendored borders — the default the resolver uses. */
export const defaultModernBorders = new ModernBorders(WORLD_COUNTRIES);
