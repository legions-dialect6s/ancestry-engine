// Walking skeleton, now with the REAL stage-3 resolver dropped in.
// Note: swapping StubResolver -> HistoricalResolver changed nothing in the
// aggregate/visualize stages. That is the contract paying off.
//
// Run: npm run dev

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { GedcomSource } from './ingest/GedcomSource';
import { buildPedigree } from './pedigree/buildPedigree';
import { StubResolver } from './resolve/StubResolver';
import { GeoNamesResolver, SAMPLE_GAZETTEER } from './resolve/GeoNamesResolver';
import { HistoricalBasemaps, SAMPLE_BOUNDARIES } from './resolve/HistoricalBasemaps';
import { HistoricalResolver } from './resolve/HistoricalResolver';
import { aggregate } from './aggregate/aggregate';
import type { RegionShare } from './aggregate/AncestryReport';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT_ID = '@I1@';
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const line = (s = '') => console.log(s);

function printShares(title: string, shares: RegionShare[] = [], asPct: boolean) {
  line(title);
  if (shares.length === 0) { line('  (none)'); return; }
  const w = Math.max(...shares.map((s) => s.region.length));
  for (const s of shares) line(`  ${s.region.padEnd(w)}  ${asPct ? pct(s.value) : s.value}`);
}

async function main() {
  const text = readFileSync(join(here, 'demo', 'sample.ged'), 'utf8');
  const tree = await new GedcomSource(text).load();
  const dag = buildPedigree(tree, ROOT_ID, 8);

  const stub = new StubResolver();
  const historical = new HistoricalResolver(
    new GeoNamesResolver(SAMPLE_GAZETTEER),
    new HistoricalBasemaps(SAMPLE_BOUNDARIES),
  );

  const report = aggregate(dag, historical);
  const collapsed = [...dag.nodes.values()].filter((n) => n.timesReached > 1);

  line('='.repeat(60));
  line('  ANCESTRY ENGINE - real resolver (geocode + historical PiP)');
  line('='.repeat(60));
  line(`parsed: ${tree.individuals.size} individuals, ${tree.families.size} families`);
  line(`pedigree: ${dag.nodes.size} ancestors, ${dag.gaps.length} gap slot(s), ` +
       `${[...dag.nodes.values()].filter((n) => n.isLeaf).length} leaves`);
  if (collapsed.length) line(`collapse: ${collapsed.map((n) => `${n.person.given ?? n.id} x${n.timesReached} (${pct(n.contributionWeight)})`).join(', ')}`);

  const c = report.coverage;
  line();
  line('COVERAGE (sums to 100%)');
  line(`  resolved ${pct(c.resolvedWeight)} | unresolved ${pct(c.unresolvedWeight)} | unknown/gaps ${pct(c.gapWeight)}`);

  line();
  printShares('FRACTIONAL by MODERN country (share of you):', report.breakdown.fractional.modernCountry, true);
  line();
  printShares('FRACTIONAL by HISTORICAL polity (at each ancestor birth year):', report.breakdown.fractional.historicalPolity, true);
  line();
  printShares('FRACTIONAL by cultural region:', report.breakdown.fractional.culturalRegion, true);

  line();
  line('TEMPORAL RESOLUTION (modern country  vs  polity at birth year):');
  const marquee: Array<[string, number]> = [
    ['Pressburg, Hungary', 1895],
    ['Köln, Germany', 1915],
    ['Helsinki, Finland', 1930],
    ['Lemberg, Austria', 1948],
  ];
  for (const [place, year] of marquee) {
    const m = stub.resolve(place, year).modernCountry ?? '-';
    const h = historical.resolve(place, year);
    line(`  ${place.split(',')[0]!.padEnd(12)} ${String(year)}  ${m.padEnd(14)} -> ${h.historicalPolity ?? '-'}`);
  }
  line();
}

main().catch((e) => { console.error(e); process.exit(1); });
