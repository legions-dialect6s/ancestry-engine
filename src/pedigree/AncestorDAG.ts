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
  /** Sum over all distinct paths of (1/2)^pathLength. The total "fraction of you" that
   *  flows through this person — a display/share quantity (HUD, globe sizing). For a
   *  person reached both as an internal node (recurses into parents) and as a terminal
   *  leaf (truncated at the depth cap), this counts BOTH passes, so it is NOT the value
   *  the coverage partition uses — see `leafWeight`. */
  contributionWeight: number;
  /** The portion of `contributionWeight` that TERMINATES at this person rather than
   *  flowing further up — summed only over the paths where this person is a leaf (no
   *  known parents, or truncated at the depth cap). This is the partition weight the
   *  coverage budget consumes: each unit of root weight terminates exactly once, so
   *  `sum(leafWeight over leaves) + sum(gap weights) === 1`. For a leaf reached only as
   *  a leaf (the common case: shallow / collapse-free), `leafWeight === contributionWeight`.
   *  For a person reached below the cap AND at it, only the at-cap pass counts here, so
   *  the below-cap pass (already represented in their recursed-into parents) is not
   *  double-counted. 0 for purely-internal nodes. */
  leafWeight: number;
  /** True if this person terminates a line on at least one path (no known parents, or
   *  truncated by the depth cap) — i.e. `leafWeight > 0`. Drives leaf styling/attribution.
   *  A person can be a leaf on one path and internal on another (pedigree collapse + cap);
   *  the weight split between the two lives in `leafWeight` vs `contributionWeight`. */
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
