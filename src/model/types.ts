// Shared domain model. These are the primitives every stage speaks in.
// They are intentionally source-agnostic: a GEDCOM file and a FamilySearch
// API response both reduce to Individuals + Families + Events.

export type Sex = 'M' | 'F' | 'U';

/** A parsed genealogical date. We keep the raw string because GEDCOM dates are
 *  messy ("ABT 1850", "BET 1840 AND 1850") and the resolver needs a year, not a Date. */
export interface GDate {
  raw: string;
  year: number | null;
  approximate: boolean;
}

export interface LifeEvent {
  type: 'BIRT' | 'DEAT' | string;
  date: GDate | null;
  /** Raw place string, exactly as recorded. Resolution happens in stage 3, not here. */
  place: string | null;
}

export interface Individual {
  id: string;
  given: string | null;
  surname: string | null;
  sex: Sex;
  events: LifeEvent[];
  /** Families in which this person is a child (links upward to parents). */
  famc: string[];
  /** Families in which this person is a spouse. */
  fams: string[];
}

export interface Family {
  id: string;
  husband: string | null;
  wife: string | null;
  children: string[];
}

export function displayName(p: Individual): string {
  return [p.given, p.surname].filter(Boolean).join(' ') || p.id;
}

export function birthEvent(p: Individual): LifeEvent | null {
  return p.events.find((e) => e.type === 'BIRT') ?? null;
}
