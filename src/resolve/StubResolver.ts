// Stub resolver — the one disposable *implementation* in the checkpoint.
// It matches the last resolvable token of a comma-separated GEDCOM place against
// the alias map and returns a modern country. No coordinates, no temporal logic.
//
// It deliberately ignores `year`, leaving historicalPolity == modernCountry, so the
// output honestly shows what is missing until the real resolver lands.

import type { Resolver, ResolvedPlace } from './ResolvedPlace';
import { unresolved } from './ResolvedPlace';
import { COUNTRY_ALIASES, CULTURAL_REGION } from './aliases';

export class StubResolver implements Resolver {
  resolve(placeRaw: string | null, _year: number | null): ResolvedPlace {
    if (!placeRaw || !placeRaw.trim()) return unresolved(placeRaw, 'stub:empty');

    const tokens = placeRaw
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .reverse(); // country is usually last in a GEDCOM place hierarchy

    for (const tok of tokens) {
      const country = COUNTRY_ALIASES[tok];
      if (country) {
        return {
          raw: placeRaw,
          coords: null,
          modernCountry: country,
          historicalPolity: country, // STUB: no temporal reconciliation yet
          culturalRegion: CULTURAL_REGION[country] ?? null,
          confidence: 0.5, // flat: a string match, not a geocode
          borderPrecision: null,
          alternatives: [],
          provenance: `stub:alias("${tok}")`,
        };
      }
    }

    return unresolved(placeRaw, 'stub:no-alias-match');
  }
}
