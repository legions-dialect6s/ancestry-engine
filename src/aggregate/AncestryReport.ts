// ===== STAGE 4 CONTRACT: Aggregation =====
// The report carries every scheme x granularity the UI might want, plus an explicit
// uncertainty budget. Coverage is a first-class output, never a footnote:
// resolvedWeight + unresolvedWeight + gapWeight == 1.

export type Scheme = 'fractional' | 'headcount';
export type Granularity = 'modernCountry' | 'historicalPolity' | 'culturalRegion';

export interface RegionShare {
  region: string;
  /** For 'fractional': share of you (0..1). For 'headcount': number of ancestors. */
  value: number;
}

export interface Coverage {
  /** Leaf weight whose birthplace resolved. */
  resolvedWeight: number;
  /** Leaf weight with a birthplace we could not resolve. */
  unresolvedWeight: number;
  /** Weight sitting in missing-parent (Gap) slots. */
  gapWeight: number;
}

export interface AncestryReport {
  rootId: string;
  maxGenerations: number;
  generatedAt: string;
  coverage: Coverage;
  /** scheme -> granularity -> ranked shares. Fractional shares are "of you", so they
   *  intentionally do NOT sum to 1 — the remainder is the uncertainty in `coverage`. */
  breakdown: Record<Scheme, Partial<Record<Granularity, RegionShare[]>>>;
}
