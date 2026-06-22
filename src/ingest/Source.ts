// ===== STAGE 1 CONTRACT: Ingest =====
// A Source produces a ParsedTree. The format adapter lives behind this port,
// so swapping the GEDCOM parser for a FamilySearch API client (or a different
// GEDCOM library) changes nothing downstream.

import type { Individual, Family } from '../model/types';

export interface ParsedTree {
  individuals: Map<string, Individual>;
  families: Map<string, Family>;
}

export interface Source {
  load(): Promise<ParsedTree>;
}
