// One entry point that both the CLI and the browser call. Runs the whole pipeline
// and returns (a) the AncestryReport for the HUD and (b) per-ancestor records with
// resolved coordinates for the globe. Pure and async; no DOM, no Node-only APIs, so
// it runs client-side in the browser too (your tree never leaves the device).

import { GedcomSource } from './ingest/GedcomSource';
import { buildPedigree } from './pedigree/buildPedigree';
import { aggregate } from './aggregate/aggregate';
import { GeoNamesResolver, SAMPLE_GAZETTEER } from './resolve/GeoNamesResolver';
import { HistoricalBasemaps, SAMPLE_BOUNDARIES } from './resolve/HistoricalBasemaps';
import { HistoricalResolver } from './resolve/HistoricalResolver';
import type { Resolver } from './resolve/ResolvedPlace';
import type { AncestryReport } from './aggregate/AncestryReport';
import type { GapNode } from './pedigree/AncestorDAG';
import { birthEvent, displayName } from './model/types';
import type { ParsedTree } from './ingest/Source';

export interface GlobeAncestor {
  id: string;
  name: string;
  minDepth: number;
  depths: number[];
  contributionWeight: number;
  isLeaf: boolean;
  timesReached: number;
  birthYear: number | null;
  birthPlace: string | null;
  lat: number | null;
  lng: number | null;
  modernCountry: string | null;
  historicalPolity: string | null;
  culturalRegion: string | null;
  confidence: number;
  provenance: string;
}

export interface GlobeLink { childId: string; parentId: string }

export interface AnalysisResult {
  rootId: string;
  maxGenerations: number;
  report: AncestryReport;
  ancestors: GlobeAncestor[];
  links: GlobeLink[];
  /** Missing-parent slots carrying weight — first-class, never silently dropped. */
  gaps: GapNode[];
  /** Raw size of the parsed tree, before pedigree expansion from the root. */
  treeSize: { individuals: number; families: number };
}

/** Default real resolver wired with the sample datasets. Swap the sample data for a
 *  GeoNames dump + historical-basemaps GeoJSON and this signature is unchanged. */
export function defaultResolver(): Resolver {
  return new HistoricalResolver(new GeoNamesResolver(SAMPLE_GAZETTEER), new HistoricalBasemaps(SAMPLE_BOUNDARIES));
}

/** Pick the focal descendant: the individual whose ancestry (walking FAMC links
 *  upward) reaches the most distinct people. A real Ancestry export rarely puts the
 *  home person at @I1@, so choosing by id finds some random ancestor with no parents
 *  of their own and the whole pipeline comes back empty. The largest pedigree belongs
 *  to the most-recent descendant — that's who we want. Each person's ancestor SET is
 *  memoized (distinct counts must dedupe shared ancestors from pedigree collapse), so
 *  a wide tree is walked once rather than once per candidate descendant. */
function pickRoot(tree: ParsedTree): string {
  if (tree.individuals.size === 0) throw new Error('No individuals in tree');

  const memo = new Map<string, Set<string>>();
  const inProgress = new Set<string>(); // breaks directed cycles in malformed data

  const ancestorsOf = (id: string): Set<string> => {
    const cached = memo.get(id);
    if (cached) return cached;
    if (inProgress.has(id)) return new Set();
    inProgress.add(id);
    const acc = new Set<string>();
    const famId = tree.individuals.get(id)?.famc[0];
    const fam = famId ? tree.families.get(famId) : undefined;
    for (const parentId of [fam?.husband, fam?.wife]) {
      if (!parentId || !tree.individuals.has(parentId)) continue;
      acc.add(parentId);
      for (const a of ancestorsOf(parentId)) acc.add(a);
    }
    inProgress.delete(id);
    memo.set(id, acc);
    return acc;
  };

  let bestId: string | undefined;
  let bestCount = -1;
  for (const id of tree.individuals.keys()) {
    const count = ancestorsOf(id).size;
    if (count > bestCount) { bestCount = count; bestId = id; } // strict >: first on ties
  }
  return bestId!;
}

export async function analyze(
  gedcomText: string,
  opts: { rootId?: string; maxGenerations?: number; resolver?: Resolver } = {},
): Promise<AnalysisResult> {
  const resolver = opts.resolver ?? defaultResolver();
  const maxGenerations = opts.maxGenerations ?? 8;
  const tree = await new GedcomSource(gedcomText).load();
  const rootId = opts.rootId ?? pickRoot(tree);
  const dag = buildPedigree(tree, rootId, maxGenerations);
  const report = aggregate(dag, resolver);

  const ancestors: GlobeAncestor[] = [];
  for (const node of dag.nodes.values()) {
    const b = birthEvent(node.person);
    const rp = resolver.resolve(b?.place ?? null, b?.date?.year ?? null, b?.coords ?? null);
    ancestors.push({
      id: node.id,
      name: displayName(node.person),
      minDepth: Math.min(...node.depths),
      depths: node.depths,
      contributionWeight: node.contributionWeight,
      isLeaf: node.isLeaf,
      timesReached: node.timesReached,
      birthYear: b?.date?.year ?? null,
      birthPlace: b?.place ?? null,
      lat: rp.coords?.lat ?? null,
      lng: rp.coords?.lng ?? null,
      modernCountry: rp.modernCountry,
      historicalPolity: rp.historicalPolity,
      culturalRegion: rp.culturalRegion,
      confidence: rp.confidence,
      provenance: rp.provenance,
    });
  }

  const links: GlobeLink[] = [];
  for (const [childId, p] of dag.links) {
    if (p.father) links.push({ childId, parentId: p.father });
    if (p.mother) links.push({ childId, parentId: p.mother });
  }

  return {
    rootId,
    maxGenerations,
    report,
    ancestors,
    links,
    gaps: dag.gaps,
    treeSize: { individuals: tree.individuals.size, families: tree.families.size },
  };
}
