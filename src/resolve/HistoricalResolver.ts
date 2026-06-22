// The real stage-3 Resolver: geocode -> temporal point-in-polygon -> assemble.
// Drop-in replacement for StubResolver (same interface), so the aggregator and
// everything downstream are untouched.

import type { Resolver, ResolvedPlace } from './ResolvedPlace';
import { unresolved } from './ResolvedPlace';
import type { Geocoder } from './GeoNamesResolver';
import type { HistoricalBoundaries } from './HistoricalBasemaps';

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

  constructor(private readonly geocoder: Geocoder, private readonly boundaries: HistoricalBoundaries) {}

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

    const out: ResolvedPlace = {
      raw: placeRaw,
      coords: { lat: hit.lat, lng: hit.lng },
      modernCountry: hit.modernCountry,
      historicalPolity: null,
      culturalRegion: null,
      confidence: hit.score,
      borderPrecision: null,
      alternatives: [],
      provenance: `geonames:"${hit.matchedName}"->(${hit.lat},${hit.lng}) ${hit.countryCode}`,
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
        out.historicalPolity = hit.modernCountry; // fallback: no historical polygon
        out.provenance += `; histbasemaps:no-polygon@${year}(fallback->modern)`;
      }
    } else {
      out.historicalPolity = hit.modernCountry;
      out.provenance += '; no-date(historical=modern)';
    }

    this.cache.set(key, out);
    return out;
  }

  /** Resolve directly from a known point: coordinates are exact, the modern country
   *  comes from the place string, and the historical polity from temporal PiP. */
  private fromCoords(placeRaw: string | null, year: number | null, coords: { lat: number; lng: number }): ResolvedPlace {
    const out: ResolvedPlace = {
      raw: placeRaw ?? '',
      coords: { lat: coords.lat, lng: coords.lng },
      modernCountry: countryFromPlace(placeRaw),
      historicalPolity: null,
      culturalRegion: null,
      confidence: 0.95, // exact point; the historical assignment may still be coarse
      borderPrecision: null,
      alternatives: [],
      provenance: `gedcom-embedded-coords:(${coords.lat},${coords.lng})`,
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
