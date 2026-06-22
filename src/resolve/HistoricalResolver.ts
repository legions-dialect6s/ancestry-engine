// The real stage-3 Resolver: geocode -> temporal point-in-polygon -> assemble.
// Drop-in replacement for StubResolver (same interface), so the aggregator and
// everything downstream are untouched.

import type { Resolver, ResolvedPlace } from './ResolvedPlace';
import { unresolved } from './ResolvedPlace';
import type { Geocoder } from './GeoNamesResolver';
import type { HistoricalBoundaries } from './HistoricalBasemaps';

export class HistoricalResolver implements Resolver {
  private cache = new Map<string, ResolvedPlace>();

  constructor(private readonly geocoder: Geocoder, private readonly boundaries: HistoricalBoundaries) {}

  resolve(placeRaw: string | null, year: number | null): ResolvedPlace {
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
}
