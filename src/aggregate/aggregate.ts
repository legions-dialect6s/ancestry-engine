// Walks the DAG, resolves each ancestor's birthplace, and rolls up two lenses:
//   - fractional: leaf attribution -> "share of you" per region (honest: the
//     unknown remainder lives in coverage, not hidden by normalization).
//   - headcount: how many distinct documented ancestors were born in each region.
// These answer different questions on purpose.

import type { AncestorDAG } from '../pedigree/AncestorDAG';
import type { Resolver, ResolvedPlace } from '../resolve/ResolvedPlace';
import { birthEvent } from '../model/types';
import type { AncestryReport, Granularity, RegionShare, Scheme } from './AncestryReport';

const GRANULARITIES: Granularity[] = ['modernCountry', 'historicalPolity', 'culturalRegion'];

function regionOf(rp: ResolvedPlace, g: Granularity): string | null {
  return g === 'modernCountry' ? rp.modernCountry : g === 'historicalPolity' ? rp.historicalPolity : rp.culturalRegion;
}

function rank(map: Map<string, number>): RegionShare[] {
  return [...map.entries()].map(([region, value]) => ({ region, value })).sort((a, b) => b.value - a.value);
}

export function aggregate(dag: AncestorDAG, resolver: Resolver): AncestryReport {
  const frac: Record<Granularity, Map<string, number>> = {
    modernCountry: new Map(), historicalPolity: new Map(), culturalRegion: new Map(),
  };
  const head: Record<Granularity, Map<string, number>> = {
    modernCountry: new Map(), historicalPolity: new Map(), culturalRegion: new Map(),
  };

  let resolvedWeight = 0;
  let unresolvedWeight = 0;
  const gapWeight = dag.gaps.reduce((s, g) => s + g.contributionWeight, 0);

  // Cache: many ancestors share a birthplace.
  const cache = new Map<string, ResolvedPlace>();
  const resolve = (place: string | null, year: number | null): ResolvedPlace => {
    const key = `${place ?? ''}|${year ?? ''}`;
    let rp = cache.get(key);
    if (!rp) { rp = resolver.resolve(place, year); cache.set(key, rp); }
    return rp;
  };

  for (const node of dag.nodes.values()) {
    const birth = birthEvent(node.person);
    const rp = resolve(birth?.place ?? null, birth?.date?.year ?? null);
    const isResolved = rp.modernCountry !== null;

    // Fractional makeup is attributed at leaves only (a leaf represents its branch).
    if (node.isLeaf) {
      if (isResolved) {
        resolvedWeight += node.contributionWeight;
        for (const g of GRANULARITIES) {
          const r = regionOf(rp, g);
          if (r) frac[g].set(r, (frac[g].get(r) ?? 0) + node.contributionWeight);
        }
      } else {
        unresolvedWeight += node.contributionWeight;
      }
    }

    // Headcount counts every distinct documented ancestor with a resolvable place.
    if (isResolved) {
      for (const g of GRANULARITIES) {
        const r = regionOf(rp, g);
        if (r) head[g].set(r, (head[g].get(r) ?? 0) + 1);
      }
    }
  }

  const breakdown: AncestryReport['breakdown'] = { fractional: {}, headcount: {} };
  for (const g of GRANULARITIES) {
    breakdown.fractional[g] = rank(frac[g]);
    breakdown.headcount[g] = rank(head[g]);
  }

  return {
    rootId: dag.rootId,
    maxGenerations: dag.maxGenerations,
    generatedAt: new Date().toISOString(),
    coverage: { resolvedWeight, unresolvedWeight, gapWeight },
    breakdown,
  };
}
