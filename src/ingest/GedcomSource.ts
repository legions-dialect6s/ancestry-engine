// GEDCOM adapter (implements the Source port).
//
// This ships a small, dependency-free parser covering the subset needed to walk
// a pedigree: INDI (NAME, SEX, BIRT/DEAT > DATE/PLAC, FAMC, FAMS) and FAM
// (HUSB, WIFE, CHIL). GEDCOM's line grammar — `level [@xref@] tag [value]` — is
// stable across 5.5.1 and 7, so this handles a FamilySearch export fine.
//
// SWAP POINT: when you need full fidelity (sources, notes, GEDCOM 7 structures,
// non-Latin encodings), replace the parse() body with `read-gedcom` and keep the
// mapping into ParsedTree. The Source interface means nothing else has to change.

import type { Source, ParsedTree } from './Source';
import type { Individual, Family, LifeEvent, GDate, Sex } from '../model/types';

const EVENT_TAGS = new Set(['BIRT', 'DEAT', 'CHR', 'BURI', 'MARR']);

function parseGDate(value: string): GDate {
  const m = value.match(/\b(\d{3,4})\b/);
  const yr = m?.[1];
  return {
    raw: value,
    year: yr ? parseInt(yr, 10) : null,
    approximate: /\b(ABT|EST|CAL|BET|BEF|AFT|FROM|TO)\b/i.test(value),
  };
}

/** Parse a GEDCOM MAP coordinate: a plain signed decimal ("45.5236", "-122.675") or
 *  the spec's hemisphere-prefixed form ("N45.5236", "W122.675"). */
function parseCoord(value: string): number | null {
  const m = value.trim().match(/^([NSEW])?\s*(-?\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  const n = parseFloat(m[2]!);
  if (!Number.isFinite(n)) return null;
  const hemi = m[1]?.toUpperCase();
  if (hemi === 'S' || hemi === 'W') return -Math.abs(n);
  if (hemi === 'N' || hemi === 'E') return Math.abs(n);
  return n;
}

const validCoord = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

function parseName(value: string): { given: string | null; surname: string | null } {
  const m = value.match(/^(.*?)\/(.*?)\//);
  if (m) return { given: (m[1] ?? '').trim() || null, surname: (m[2] ?? '').trim() || null };
  return { given: value.trim() || null, surname: null };
}

interface GLine {
  level: number;
  xref: string | null;
  tag: string;
  value: string;
}

function tokenize(line: string): GLine | null {
  const t = line.replace(/\r$/, '').trim();
  if (!t) return null;
  const parts = t.split(/ +/);
  const level = parseInt(parts[0] ?? '', 10);
  if (Number.isNaN(level)) return null;
  const a = parts[1];
  if (a && a.startsWith('@') && a.endsWith('@')) {
    return { level, xref: a, tag: parts[2] ?? '', value: parts.slice(3).join(' ') };
  }
  return { level, xref: null, tag: a ?? '', value: parts.slice(2).join(' ') };
}

export class GedcomSource implements Source {
  constructor(private readonly text: string) {}

  async load(): Promise<ParsedTree> {
    const individuals = new Map<string, Individual>();
    const families = new Map<string, Family>();

    let curInd: Individual | null = null;
    let curFam: Family | null = null;
    let curEvent: LifeEvent | null = null;

    for (const raw of this.text.split('\n')) {
      const ln = tokenize(raw);
      if (!ln) continue;

      if (ln.level === 0) {
        curEvent = null;
        curInd = null;
        curFam = null;
        if (ln.tag === 'INDI' && ln.xref) {
          curInd = { id: ln.xref, given: null, surname: null, sex: 'U', events: [], famc: [], fams: [] };
          individuals.set(ln.xref, curInd);
        } else if (ln.tag === 'FAM' && ln.xref) {
          curFam = { id: ln.xref, husband: null, wife: null, children: [] };
          families.set(ln.xref, curFam);
        }
        continue;
      }

      if (ln.level === 1) {
        curEvent = null;
        if (curInd) {
          switch (ln.tag) {
            case 'NAME': {
              const { given, surname } = parseName(ln.value);
              curInd.given ??= given;
              curInd.surname ??= surname;
              break;
            }
            case 'SEX':
              curInd.sex = (['M', 'F'].includes(ln.value) ? ln.value : 'U') as Sex;
              break;
            case 'FAMC':
              if (ln.value) curInd.famc.push(ln.value);
              break;
            case 'FAMS':
              if (ln.value) curInd.fams.push(ln.value);
              break;
            default:
              if (EVENT_TAGS.has(ln.tag)) {
                curEvent = { type: ln.tag, date: null, place: null };
                curInd.events.push(curEvent);
              }
          }
        } else if (curFam) {
          if (ln.tag === 'HUSB') curFam.husband = ln.value || null;
          else if (ln.tag === 'WIFE') curFam.wife = ln.value || null;
          else if (ln.tag === 'CHIL' && ln.value) curFam.children.push(ln.value);
        }
        continue;
      }

      // Event sub-structure: DATE/PLAC at level 2, then MAP > LATI/LONG nested below
      // the place at level 4. curEvent persists across these deeper levels.
      if (curEvent) {
        if (ln.level === 2 && ln.tag === 'DATE') curEvent.date = parseGDate(ln.value);
        else if (ln.level === 2 && ln.tag === 'PLAC') curEvent.place = ln.value || null;
        else if (ln.level === 4 && ln.tag === 'LATI') {
          const lat = parseCoord(ln.value);
          if (lat !== null) curEvent.coords = { lat, lng: curEvent.coords?.lng ?? NaN };
        } else if (ln.level === 4 && ln.tag === 'LONG') {
          const lng = parseCoord(ln.value);
          if (lng !== null) curEvent.coords = { lat: curEvent.coords?.lat ?? NaN, lng };
        }
      }
    }

    // Drop partial or out-of-range embedded coordinates (need both axes, in range).
    for (const ind of individuals.values()) {
      for (const ev of ind.events) {
        if (ev.coords && !validCoord(ev.coords.lat, ev.coords.lng)) ev.coords = null;
      }
    }

    return { individuals, families };
  }
}
