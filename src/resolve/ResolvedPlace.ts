// ===== STAGE 3 CONTRACT: Place resolution (the core) =====
// Everything about turning "Lemberg, Austria, 1881" into a place hides behind this
// one interface. The checkpoint ships a stub that only knows modern countries; the
// real implementation (GeoNames geocode -> point-in-polygon against
// aourednik/historical-basemaps for the event year -> cultural region -> confidence)
// drops in behind the same signature with zero downstream changes.

export type Confidence = number; // 0..1

export interface ResolvedPlace {
  raw: string;
  coords: { lat: number; lng: number } | null;
  /** Present-day country (what a DNA test would label). */
  modernCountry: string | null;
  /** Polity that controlled this point at the event date (e.g. Austria-Hungary). */
  historicalPolity: string | null;
  /** Ethnolinguistic / cultural grouping (historical-basemaps PARTOF), e.g. "Nordic". */
  culturalRegion: string | null;
  confidence: Confidence;
  /** From historical-basemaps BORDERPRECISION: 1 approximate .. 3 legally-defined.
   *  Drives blur/desaturation in the uncertainty visualization. */
  borderPrecision: 1 | 2 | 3 | null;
  alternatives: string[];
  /** Why it resolved this way. Bake this in from day one — it is the debugger and
   *  the portfolio talking point. Retrofitting provenance is miserable. */
  provenance: string;
}

export interface Resolver {
  /** `coords`, when present, are coordinates already attached to the record (e.g.
   *  embedded in a GEDCOM PLAC>MAP). A resolver MAY use them to resolve from the point
   *  directly; it remains free to ignore them. Optional, so existing resolvers and
   *  callers are unaffected. */
  resolve(
    placeRaw: string | null,
    year: number | null,
    coords?: { lat: number; lng: number } | null,
  ): ResolvedPlace;
}

export function unresolved(raw: string | null, provenance: string): ResolvedPlace {
  return {
    raw: raw ?? '',
    coords: null,
    modernCountry: null,
    historicalPolity: null,
    culturalRegion: null,
    confidence: 0,
    borderPrecision: null,
    alternatives: [],
    provenance,
  };
}
