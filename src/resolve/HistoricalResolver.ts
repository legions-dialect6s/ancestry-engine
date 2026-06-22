// The real stage-3 Resolver: geocode -> temporal point-in-polygon -> assemble.
// Drop-in replacement for StubResolver (same interface), so the aggregator and
// everything downstream are untouched.

import type { Resolver, ResolvedPlace } from './ResolvedPlace';
import { unresolved } from './ResolvedPlace';
import type { Geocoder } from './GeoNamesResolver';
import type { HistoricalBoundaries } from './HistoricalBasemaps';
import { ModernBorders, defaultModernBorders } from './ModernBorders';
import { canonicalizeCountry } from './PlaceCanon';
import { ancientCoordContradiction } from './AncientPlaces';

/** Best-effort modern country from a GEDCOM place hierarchy ("City, County, State,
 *  Country") — the last comma-separated token. Lets a coordinate-resolved place still
 *  populate the modern-country breakdown without a gazetteer hit. */
function countryFromPlace(placeRaw: string | null): string | null {
  if (!placeRaw) return null;
  const parts = placeRaw.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : null;
}

export class HistoricalResolver implements Resolver {
  private cache = new Map<string, ResolvedPlace>();

  constructor(
    private readonly geocoder: Geocoder,
    private readonly boundaries: HistoricalBoundaries,
    private readonly borders: ModernBorders = defaultModernBorders,
  ) {}

  resolve(placeRaw: string | null, year: number | null, coords?: { lat: number; lng: number } | null): ResolvedPlace {
    // Embedded coordinate (FamilySearch attaches one to ~every place): resolve from
    // the point itself and skip the gazetteer entirely. This is the big coverage win.
    if (coords) {
      const ckey = `coord|${coords.lat},${coords.lng}|${year ?? ''}|${placeRaw ?? ''}`;
      const cachedCoord = this.cache.get(ckey);
      if (cachedCoord) return cachedCoord;
      const out = this.fromCoords(placeRaw, year, coords);
      this.cache.set(ckey, out);
      return out;
    }

    if (!placeRaw || !placeRaw.trim()) return unresolved(placeRaw, 'empty');
    const key = `${placeRaw}|${year ?? ''}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const hit = this.geocoder.geocode(placeRaw);
    if (!hit) {
      const miss = unresolved(placeRaw, 'geonames:no-match');
      this.cache.set(key, miss);
      return miss;
    }

    const canon = canonicalizeCountry(hit.modernCountry);
    const out: ResolvedPlace = {
      raw: placeRaw,
      coords: { lat: hit.lat, lng: hit.lng },
      modernCountry: canon.canonical,
      modernCountryRaw: canon.raw,
      historicalPolity: null,
      culturalRegion: null,
      confidence: hit.score,
      borderPrecision: null,
      alternatives: [],
      provenance: `geonames:"${hit.matchedName}"->(${hit.lat},${hit.lng}) ${hit.countryCode}`
        + (canon.changed ? `; canon:"${canon.raw}"->"${canon.canonical}"` : ''),
    };

    if (year != null) {
      const polity = this.boundaries.resolve(hit.lat, hit.lng, year);
      if (polity) {
        out.historicalPolity = polity.subjecto;
        out.culturalRegion = polity.partOf;
        out.borderPrecision = polity.borderPrecision;
        out.confidence = hit.score * (polity.borderPrecision / 3);
        out.provenance += `; histbasemaps:${polity.snapshotYear} "${polity.name}" partOf=${polity.partOf ?? '-'} prec=${polity.borderPrecision}`;
      } else {
        out.historicalPolity = out.modernCountry; // fallback: no historical polygon
        out.provenance += `; histbasemaps:no-polygon@${year}(fallback->modern)`;
      }
    } else {
      out.historicalPolity = out.modernCountry;
      out.provenance += '; no-date(historical=modern)';
    }

    this.cache.set(key, out);
    return out;
  }

  /** Resolve directly from a known point: coordinates are exact, the modern country
   *  comes from the place string, and the historical polity from temporal PiP. */
  private fromCoords(placeRaw: string | null, year: number | null, coords: { lat: number; lng: number }): ResolvedPlace {
    const canon = canonicalizeCountry(countryFromPlace(placeRaw));
    const modernCountry = canon.canonical;
    const canonNote = canon.changed ? `; canon:"${canon.raw}"->"${canon.canonical}"` : '';

    // Coordinate dropped but label kept (no wrong dot, composition stays right).
    const rejected = (note: string): ResolvedPlace => ({
      raw: placeRaw ?? '',
      coords: null,
      modernCountry,
      modernCountryRaw: canon.raw,
      historicalPolity: modernCountry,
      culturalRegion: null,
      confidence: 0.4,
      borderPrecision: null,
      alternatives: [],
      provenance: `gedcom-embedded-coords:(${coords.lat},${coords.lng}); ${note}${canonNote}`,
    });

    // Coordinate sanity (modern): FamilySearch sometimes stamps a garbage point on a
    // correct place string ("…, Scotland" carrying a point in India). If the string
    // names a known modern country and the point clearly falls in a different one,
    // distrust the point. Conservative — historical/unmatched names, ambiguous/ocean
    // points, and shared-territory pairs are left trusted.
    const check = this.borders.contradicts(modernCountry, coords.lat, coords.lng);
    if (check.contradicts) {
      return rejected(`coord-rejected:string="${modernCountry}",point-in="${check.pointCountry}"`);
    }
    // Coordinate sanity (ancient): only when the modern check couldn't validate (the
    // country token isn't a known modern country) — catches "Edom (Idumaea)" in South
    // Africa that the modern check misses. Small, bounded table; see AncientPlaces.
    if (!check.stringKnown) {
      const ancient = ancientCoordContradiction(placeRaw, coords.lat, coords.lng);
      if (ancient) return rejected(`coord-rejected:ancient="${ancient}",point=(${coords.lat.toFixed(2)},${coords.lng.toFixed(2)})`);
    }

    const out: ResolvedPlace = {
      raw: placeRaw ?? '',
      coords: { lat: coords.lat, lng: coords.lng },
      modernCountry,
      modernCountryRaw: canon.raw,
      historicalPolity: null,
      culturalRegion: null,
      confidence: 0.95, // exact point; the historical assignment may still be coarse
      borderPrecision: null,
      alternatives: [],
      provenance: `gedcom-embedded-coords:(${coords.lat},${coords.lng})${canonNote}`,
    };

    if (year != null) {
      const polity = this.boundaries.resolve(coords.lat, coords.lng, year);
      if (polity) {
        out.historicalPolity = polity.subjecto;
        out.culturalRegion = polity.partOf;
        out.borderPrecision = polity.borderPrecision;
        out.confidence = 0.95 * (polity.borderPrecision / 3);
        out.provenance += `; histbasemaps:${polity.snapshotYear} "${polity.name}" partOf=${polity.partOf ?? '-'} prec=${polity.borderPrecision}`;
      } else {
        out.historicalPolity = out.modernCountry; // fallback: no historical polygon
        out.provenance += `; histbasemaps:no-polygon@${year}(fallback->modern)`;
      }
    } else {
      out.historicalPolity = out.modernCountry;
      out.provenance += '; no-date(historical=modern)';
    }

    return out;
  }
}
