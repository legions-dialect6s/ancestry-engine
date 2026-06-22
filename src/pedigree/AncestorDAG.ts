// ===== STAGE 2 CONTRACT: Pedigree graph =====
// Ancestry is a DAG, not a tree: pedigree collapse (shared ancestors via cousin
// marriages, endogamy) puts one person in multiple slots. We model that, and we
// model *missing* parents as explicit Gap nodes so uncertainty is a value we
// carry forward rather than a hole someone has to infer later.

import type { Individual } from '../model/types';

export interface AncestorNode {
  kind: 'ancestor';
  id: string;
  person: Individual;
  /** Pedigree depths at which this person appears. */
  depths: number[];
  /** Number of distinct paths that reach this person. >1 means pedigree collapse. */
  timesReached: number;
  /** Sum over all distinct paths of (1/2)^pathLength. Equals "fraction of you". */
  contributionWeight: number;
  /** True if this is a terminal known ancestor (no known parents) — a leaf of the
   *  known pedigree. Leaves carry the weight of their entire unexplored branch. */
  isLeaf: boolean;
}

export interface GapNode {
  kind: 'gap';
  id: string;
  /** The missing slot's depth. */
  depth: number;
  contributionWeight: number;
  /** The known person whose parent is missing, and which parent. */
  missingParentOf: string;
  slot: 'father' | 'mother';
}

export interface AncestorDAG {
  rootId: string;
  maxGenerations: number;
  nodes: Map<string, AncestorNode>;
  gaps: GapNode[];
  /** childId -> parent links, for fan-chart / migration rendering later. */
  links: Map<string, { father?: string; mother?: string }>;
}
