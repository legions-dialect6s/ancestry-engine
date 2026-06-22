// Analyze any GEDCOM from the command line and print a text report.
//
//   npm run analyze:file -- <path.ged> [--root @I3@] [--gen 10]
//   tsx scripts/analyze-file.ts <path.ged> [--root @I3@] [--gen 10]
//
// Prints: parsed individuals/families, ancestors/leaves/gaps, deepest generation
// reached, the coverage budget, top fractional shares (modern + historical), and the
// most common birthplace strings the resolver could NOT place — a data-quality signal
// for what to clean up next. Privacy: this runs locally; a real GEDCOM is PII, so
// point it at your own file and never commit it (see .gitignore).

import { readFileSync } from 'node:fs';

import { analyze } from '../src/analyze';
import type { GlobeAncestor } from '../src/analyze';
import type { RegionShare } from '../src/aggregate/AncestryReport';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const line = (s = '') => console.log(s);

interface Args {
  path: string;
  root: string | undefined;
  gen: number | undefined;
}

function parseArgs(argv: string[]): Args {
  let path: string | undefined;
  let root: string | undefined;
  let gen: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;
    const eq = tok.indexOf('=');
    const [flag, inlineVal] = eq >= 0 ? [tok.slice(0, eq), tok.slice(eq + 1)] : [tok, undefined];
    const takeVal = () => inlineVal ?? argv[++i];

    if (flag === '--root') root = takeVal();
    else if (flag === '--gen') {
      const v = takeVal();
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) fail(`--gen expects a non-negative number, got "${v}"`);
      gen = Math.floor(n);
    } else if (flag.startsWith('--')) fail(`unknown flag "${flag}"`);
    else if (path === undefined) path = tok;
    else fail(`unexpected extra argument "${tok}"`);
  }

  if (!path) fail('missing GEDCOM path');
  return { path: path!, root, gen };
}

function fail(msg: string): never {
  console.error(`analyze-file: ${msg}`);
  console.error('usage: npm run analyze:file -- <path.ged> [--root @I3@] [--gen 10]');
  process.exit(1);
}

function printShares(title: string, shares: RegionShare[] = [], top = 8) {
  line(title);
  if (shares.length === 0) {
    line('  (none)');
    return;
  }
  const rows = shares.slice(0, top);
  const w = Math.max(...rows.map((s) => s.region.length));
  for (const s of rows) line(`  ${s.region.padEnd(w)}  ${pct(s.value)}`);
  if (shares.length > rows.length) line(`  …and ${shares.length - rows.length} more`);
}

/** Birthplace strings present in the records but not geolocated by the resolver. */
function unresolvedBirthplaces(ancestors: GlobeAncestor[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const a of ancestors) {
    if (a.birthPlace && a.lat === null) counts.set(a.birthPlace, (counts.get(a.birthPlace) ?? 0) + 1);
  }
  return [...counts.entries()].sort((x, y) => y[1] - x[1]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let text: string;
  try {
    text = readFileSync(args.path, 'utf8');
  } catch {
    fail(`cannot read file "${args.path}"`);
  }

  const r = await analyze(text, { rootId: args.root, maxGenerations: args.gen });

  const leaves = r.ancestors.filter((a) => a.isLeaf).length;
  const ancestorDepths = r.ancestors.flatMap((a) => a.depths);
  const gapDepths = r.gaps.map((g) => g.depth);
  const deepest = Math.max(0, ...ancestorDepths, ...gapDepths);
  const collapsed = r.ancestors.filter((a) => a.timesReached > 1);

  line('='.repeat(64));
  line(`  ANCESTRY ENGINE — ${args.path}`);
  line('='.repeat(64));
  line(`parsed:    ${r.treeSize.individuals} individuals, ${r.treeSize.families} families`);
  line(`root:      ${r.rootId}`);
  line(`pedigree:  ${r.ancestors.length} ancestors, ${leaves} leaves, ${r.gaps.length} gap slot(s)`);
  line(`depth:     deepest generation reached ${deepest} (cap ${r.maxGenerations})`);
  if (collapsed.length) {
    line(`collapse:  ${collapsed.map((a) => `${a.name} ×${a.timesReached} (${pct(a.contributionWeight)})`).join(', ')}`);
  }

  const c = r.report.coverage;
  line();
  line('COVERAGE (resolved + unresolved + gaps = 100%)');
  line(`  resolved ${pct(c.resolvedWeight)}  |  unresolved ${pct(c.unresolvedWeight)}  |  unknown/gaps ${pct(c.gapWeight)}`);

  line();
  printShares('TOP FRACTIONAL — modern country (share of you):', r.report.breakdown.fractional.modernCountry);
  line();
  printShares('TOP FRACTIONAL — historical polity (at birth year):', r.report.breakdown.fractional.historicalPolity);

  line();
  const unresolved = unresolvedBirthplaces(r.ancestors);
  line('MOST COMMON UNRESOLVED BIRTHPLACES (have a string, no coordinates):');
  if (unresolved.length === 0) {
    line('  (none — every recorded birthplace resolved)');
  } else {
    const w = Math.max(...unresolved.slice(0, 10).map(([p]) => p.length));
    for (const [place, n] of unresolved.slice(0, 10)) line(`  ${place.padEnd(w)}  ×${n}`);
    if (unresolved.length > 10) line(`  …and ${unresolved.length - 10} more`);
  }
  line();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
