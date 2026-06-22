// Bounded historical-place coordinate sanity. A SMALL, deliberately conservative table
// of ancient / biblical place names -> the region they actually sit in. FamilySearch
// sometimes stamps a wildly-wrong modern coordinate on these (e.g. "Edom (Idumaea)"
// carrying a point in South Africa). When a place string names one of these and its
// coord is far outside the expected box, we drop the coord (keep the label) — same
// pattern as the modern-country rejection.
//
// Two guards keep this from over-reaching:
//  1. The caller only runs this when the modern-country check could NOT validate (the
//     country token isn't a known modern country) — so a properly-formatted modern town
//     that happens to share an ancient name ("Babylon, NY, USA") is never touched.
//  2. A generous margin, so only gross cross-region / cross-continent errors trip it.

interface AncientPlace {
  name: string;
  pattern: RegExp;
  /** [west, south, east, north] — the name's real region, generously bounded. */
  bbox: [number, number, number, number];
}

// Ancient Near East names that recur in genealogies and attract garbage coords. Kept
// small on purpose; extend only with clearly-ancient, unambiguous names.
const ANCIENT_PLACES: AncientPlace[] = [
  { name: 'Edom / Idumaea', pattern: /\b(edom|idumaea|idumea)\b/i, bbox: [33, 28, 39, 33] },
  { name: 'Judaea', pattern: /\b(judaea|judea)\b/i, bbox: [33, 30, 37, 33] },
  { name: 'Mesopotamia', pattern: /\bmesopotamia\b/i, bbox: [38, 29, 49, 38] },
  { name: 'Assyria', pattern: /\bassyria\b/i, bbox: [39, 33, 46, 38] },
  { name: 'Babylonia', pattern: /\bbabylonia\b/i, bbox: [43, 30, 47, 34] },
  { name: 'Phoenicia', pattern: /\bphoenicia\b/i, bbox: [34, 32, 37, 35] },
];

const MARGIN = 10; // degrees of slack — only cross-region/continent errors trip this

/** If the place string names an ancient place AND the point is wildly outside that
 *  place's region, return the matched name (the coord should be dropped). Otherwise
 *  null. Only the first matching entry is considered. */
export function ancientCoordContradiction(placeRaw: string | null, lat: number, lng: number): string | null {
  if (!placeRaw) return null;
  for (const p of ANCIENT_PLACES) {
    if (!p.pattern.test(placeRaw)) continue;
    const [w, s, e, n] = p.bbox;
    const inside = lng >= w - MARGIN && lng <= e + MARGIN && lat >= s - MARGIN && lat <= n + MARGIN;
    return inside ? null : p.name;
  }
  return null;
}
