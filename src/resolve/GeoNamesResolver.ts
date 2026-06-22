// Geocoder: place string -> coordinates + modern country.
//
// Real backend = a local GeoNames extract (cities + alternateNames for historical
// spellings) loaded into this same shape. Hitting the GeoNames web API would work
// too but adds a key, latency, and sends place strings off-device — the local dump
// keeps it fast and private. The injected-gazetteer design means swapping the sample
// for the full dump is a data change, not a code change.

export interface GeocodeHit {
  matchedName: string;
  lat: number;
  lng: number;
  countryCode: string;
  modernCountry: string;
  /** 0..1 match quality. */
  score: number;
}

export interface Geocoder {
  geocode(place: string): GeocodeHit | null;
}

export interface GazetteerEntry {
  /** Canonical + historical/alternate spellings (lowercased, accents allowed). */
  names: string[];
  lat: number;
  lng: number;
  countryCode: string;
  modernCountry: string;
}

/** Lowercase + strip diacritics so "Åbo" == "abo", "Köln" == "koln". */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export class GeoNamesResolver implements Geocoder {
  private index = new Map<string, GazetteerEntry>();

  constructor(entries: GazetteerEntry[]) {
    for (const e of entries) for (const n of e.names) this.index.set(norm(n), e);
  }

  geocode(place: string): GeocodeHit | null {
    // GEDCOM places are "City, Region, Country" — try each token, finest first.
    const tokens = place.split(',').map(norm).filter(Boolean);
    for (const tok of tokens) {
      const e = this.index.get(tok);
      if (e) {
        return {
          matchedName: tok,
          lat: e.lat, lng: e.lng,
          countryCode: e.countryCode,
          modernCountry: e.modernCountry,
          score: 0.9,
        };
      }
    }
    return null;
  }
}

// Sample gazetteer — covers the demo tree, including historical spellings that map
// to the modern settlement (Christiania->Oslo, Åbo->Turku, Lemberg->Lviv,
// Pressburg->Bratislava). Replace with a GeoNames dump for full coverage.
export const SAMPLE_GAZETTEER: GazetteerEntry[] = [
  { names: ['albany'], lat: 44.64, lng: -123.11, countryCode: 'US', modernCountry: 'United States' },
  { names: ['portland'], lat: 45.52, lng: -122.68, countryCode: 'US', modernCountry: 'United States' },
  { names: ['boise'], lat: 43.62, lng: -116.21, countryCode: 'US', modernCountry: 'United States' },
  { names: ['salt lake city'], lat: 40.76, lng: -111.89, countryCode: 'US', modernCountry: 'United States' },
  { names: ['oslo', 'christiania', 'kristiania'], lat: 59.91, lng: 10.75, countryCode: 'NO', modernCountry: 'Norway' },
  { names: ['turku', 'åbo', 'abo'], lat: 60.45, lng: 22.27, countryCode: 'FI', modernCountry: 'Finland' },
  { names: ['lviv', 'lemberg', 'lwów', 'lwow'], lat: 49.84, lng: 24.03, countryCode: 'UA', modernCountry: 'Ukraine' },
  { names: ['köln', 'koln', 'cologne'], lat: 50.94, lng: 6.96, countryCode: 'DE', modernCountry: 'Germany' },
  { names: ['bergen'], lat: 60.39, lng: 5.32, countryCode: 'NO', modernCountry: 'Norway' },
  { names: ['stockholm'], lat: 59.33, lng: 18.07, countryCode: 'SE', modernCountry: 'Sweden' },
  { names: ['helsinki', 'helsingfors'], lat: 60.17, lng: 24.94, countryCode: 'FI', modernCountry: 'Finland' },
  { names: ['bratislava', 'pressburg', 'pozsony'], lat: 48.15, lng: 17.11, countryCode: 'SK', modernCountry: 'Slovakia' },
];
