// Builds the AncestorDAG from a ParsedTree + a root person.
//
// Weighting model (a real methodological choice — put this in your README):
//   - Each parent step halves contribution: an ancestor reached by a path of
//     length L contributes (1/2)^L for that path.
//   - Pedigree collapse: the same person reached via multiple paths accumulates
//     weight across all of them.
//   - "Makeup" is attributed at LEAVES — the most distant *known* ancestor on each
//     line — because a leaf represents its whole unexplored branch. A line we only
//     traced to a great-grandparent (depth 3, weight 1/8) counts for more than one
//     traced to depth 8 (weight 1/256). That is correct: a nearer unknown is more
//     of you.
//   - A known person with NO known parents is a leaf. A known person with ONE known
//     parent yields a Gap node for the missing slot. Leaves + gaps partition the
//     whole: their weights sum to 1.

import type { ParsedTree } from '../ingest/Source';
import type { AncestorDAG, AncestorNode, GapNode } from './AncestorDAG';

export function buildPedigree(tree: ParsedTree, rootId: string, maxGenerations = 8): AncestorDAG {
  const nodes = new Map<string, AncestorNode>();
  const gapMap = new Map<string, GapNode>();
  const links = new Map<string, { father?: string; mother?: string }>();

  if (!tree.individuals.has(rootId)) {
    throw new Error(`Root individual ${rootId} not found in tree`);
  }

  const addWeight = (id: string, depth: number, weight: number) => {
    const person = tree.individuals.get(id)!;
    const existing = nodes.get(id);
    if (existing) {
      existing.contributionWeight += weight;
      existing.timesReached += 1;
      if (!existing.depths.includes(depth)) existing.depths.push(depth);
    } else {
      nodes.set(id, { kind: 'ancestor', id, person, depths: [depth], timesReached: 1, contributionWeight: weight, isLeaf: false });
    }
  };

  const addGap = (childId: string, slot: 'father' | 'mother', depth: number, weight: number) => {
    const key = `${childId}:${slot}`;
    const existing = gapMap.get(key);
    if (existing) existing.contributionWeight += weight;
    else gapMap.set(key, { kind: 'gap', id: `gap:${key}`, depth, contributionWeight: weight, missingParentOf: childId, slot });
  };

  // Resolve a person's parents via their FAMC (family-as-child) link.
  const parentsOf = (id: string): { father: string | null; mother: string | null } => {
    const person = tree.individuals.get(id);
    const famId = person?.famc[0];
    const fam = famId ? tree.families.get(famId) : undefined;
    return {
      father: fam?.husband && tree.individuals.has(fam.husband) ? fam.husband : null,
      mother: fam?.wife && tree.individuals.has(fam.wife) ? fam.wife : null,
    };
  };

  // DFS upward. `path` guards against cycles (a person as their own ancestor).
  const walk = (id: string, depth: number, weight: number, path: Set<string>) => {
    addWeight(id, depth, weight);

    if (depth >= maxGenerations) {
      nodes.get(id)!.isLeaf = true; // truncated by our cap, not by data
      return;
    }

    const { father, mother } = parentsOf(id);
    const childWeight = weight / 2;
    const childDepth = depth + 1;

    if (!father && !mother) {
      nodes.get(id)!.isLeaf = true; // terminal known ancestor — represents this branch
      return;
    }

    links.set(id, { father: father ?? undefined, mother: mother ?? undefined });

    for (const [slot, parentId] of [['father', father], ['mother', mother]] as const) {
      if (parentId) {
        if (path.has(parentId)) continue; // cycle in source data; skip this edge
        walk(parentId, childDepth, childWeight, new Set(path).add(parentId));
      } else {
        addGap(id, slot, childDepth, childWeight);
      }
    }
  };

  walk(rootId, 0, 1, new Set([rootId]));

  return { rootId, maxGenerations, nodes, gaps: [...gapMap.values()], links };
}
