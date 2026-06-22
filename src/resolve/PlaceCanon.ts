// Place canonicalizer (stage-3 entity resolution): folds the many string variants of
// one real country into a single canonical Place entity, keeping the variants as
// evidence. "USA / US / United States of America / Va / Virginia USA" → United States;
// "Schweiz / Suisse" → Switzerland; "Eng>" → England; "Scot." → Scotland; "German
// Empire / Deutsches Reich" → Germany (the historical polity stays separate). The
// composition then groups by canonical entity, so fragmented lines sum to correct
// totals. This is the "variants → entities" proof.
//
// Deliberately an extensible data table (the on-ramp to a future folkway/diaspora
// hierarchy — same machinery, deeper). It PRESERVES meaningful distinctions: England /
// Scotland / Wales stay separate from each other and fold into "United Kingdom" ONLY if
// the string is literally "UK"/"United Kingdom". Sub-national US strings roll up to
// United States (state-level detail is a later feature). Coverage is never touched:
// unknown strings pass through unchanged, and folding only merges WITHIN the resolved
// bucket.

/** Normalize a country string for table lookup: lowercase, strip diacritics and
 *  punctuation (so "Eng>", "Scot.", "U.S.A." reduce cleanly), collapse whitespace. */
export function normalizeCountry(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface CanonicalEntity {
  canonical: string;
  /** Normalized variant forms that fold into this entity. */
  aliases: string[];
}

// Extensible table — add rows / aliases here as new offenders surface.
const ENTITIES: CanonicalEntity[] = [
  {
    canonical: 'United States',
    // sub-national US strings roll up (state-level detail is later) + common abbrevs
    aliases: ['united states', 'united states of america', 'usa', 'us', 'u s a', 'america', 'virginia', 'virginia usa', 'va'],
  },
  { canonical: 'Switzerland', aliases: ['switzerland', 'schweiz', 'suisse', 'svizzera'] },
  { canonical: 'England', aliases: ['england', 'eng'] },
  { canonical: 'Scotland', aliases: ['scotland', 'scot'] },
  { canonical: 'Wales', aliases: ['wales'] },
  { canonical: 'Germany', aliases: ['germany', 'deutschland', 'german empire', 'deutsches reich'] },
  // Only literal UK strings fold here — England/Scotland/Wales stay distinct above.
  { canonical: 'United Kingdom', aliases: ['united kingdom', 'uk'] },
  { canonical: 'Ireland', aliases: ['ireland'] },
];

const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const e of ENTITIES) for (const a of e.aliases) ALIAS_TO_CANONICAL.set(a, e.canonical);

// A trailing "… usa" / "… united states" rolls up to the US without enumerating every
// state (e.g. "Richmond Virginia USA"). Whole-word at the end only.
const US_SUFFIX = /(^| )(usa|us|united states|united states of america)$/;

export interface CanonicalCountry {
  /** Canonical entity name, or the original string unchanged if unknown. */
  canonical: string | null;
  /** The raw input string (variant evidence). */
  raw: string | null;
  /** True when canonical differs from raw (a real fold happened). */
  changed: boolean;
}

/** Map a modern-country string to its canonical Place entity. Unknown strings pass
 *  through unchanged (becoming their own entity), so coverage is never affected. */
export function canonicalizeCountry(raw: string | null): CanonicalCountry {
  if (raw == null) return { canonical: null, raw: null, changed: false };
  const norm = normalizeCountry(raw);
  let canonical = ALIAS_TO_CANONICAL.get(norm);
  if (!canonical && US_SUFFIX.test(norm)) canonical = 'United States';
  const resolved = canonical ?? raw;
  return { canonical: resolved, raw, changed: resolved !== raw };
}
