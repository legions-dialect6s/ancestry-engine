// Smoke test for the pure wiring layer (no WebGL). Run: npm run smoke
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { analyze } from '../src/analyze';
import { buildLayers, placed, filterByDepth } from '../src/web/globeData';
import { buildPedigree } from '../src/pedigree/buildPedigree';
import { aggregate } from '../src/aggregate/aggregate';
import { StubResolver } from '../src/resolve/StubResolver';
import type { ParsedTree } from '../src/ingest/Source';
import type { Individual, Family } from '../src/model/types';

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, '..', 'src', 'demo', 'sample.ged'), 'utf8');

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('ok:', msg);
}

const r = await analyze(text);

// pickRoot() (no rootId given) must choose the focal descendant by ancestor count,
// not @I1@ by id — and that choice must still yield the full sample pedigree.
assert(r.rootId === '@I1@', `auto-picked root is the focal descendant (got ${r.rootId})`);
assert(r.ancestors.length === 13, `auto-picked root yields full pedigree: 13 ancestors (got ${r.ancestors.length})`);
const placedCount = placed(r.ancestors).length;
assert(placedCount === 12, `12 placed; Hinterland unplaced (got ${placedCount})`);

const full = buildLayers(r.ancestors, r.links, 8);
assert(full.points.length === 12, `12 points at depth 8 (got ${full.points.length})`);
assert(full.arcs.length > 0, `migration arcs exist (got ${full.arcs.length})`);
// Isolate filter (A2) keys off region carried on the layer data.
assert(full.points.some((p) => p.region != null), `points carry region for the isolate filter`);
assert(full.arcs.every((a) => 'region' in a), `arcs carry parent region for the isolate filter`);

const near = filterByDepth(r.ancestors, 1);
assert(near.length === 3, `depth<=1 keeps self+parents = 3 (got ${near.length})`);

const cov = r.report.coverage;
const total = cov.resolvedWeight + cov.unresolvedWeight + cov.gapWeight;
assert(Math.abs(total - 1) < 1e-9, `coverage sums to 1 (got ${total})`);

const leaf = r.ancestors.find((a) => a.name.includes('Hungarian'));
assert(leaf?.historicalPolity === 'Austria-Hungary', `Pressburg leaf -> Austria-Hungary (got ${leaf?.historicalPolity})`);

// Coordinate validation: a place string naming one country with an embedded coord
// landing in another -> coord nulled (no wrong dot), country from the string kept.
// Control: a coord consistent with its string country is kept.
const coordGed = [
  '0 HEAD', '1 GEDC', '2 VERS 7.0',
  '0 @I1@ INDI', '1 NAME Scot /Subject/',
  '1 BIRT', '2 PLAC Newark, Renfrewshire, Scotland', '3 MAP', '4 LATI N21.0', '4 LONG E78.0', // point in India
  '1 FAMC @F1@',
  '0 @I2@ INDI', '1 NAME Aber /Parent/',
  '1 BIRT', '2 PLAC Aberdeen, Aberdeenshire, Scotland', '3 MAP', '4 LATI N56.8', '4 LONG W4.2', // interior Scotland
  '0 @F1@ FAM', '1 HUSB @I2@', '1 CHIL @I1@',
  '0 TRLR', '',
].join('\n');
const cr = await analyze(coordGed);
const subj = cr.ancestors.find((a) => a.id === '@I1@');
assert(subj?.modernCountry === 'Scotland', `coord-mismatch keeps string country (got ${subj?.modernCountry})`);
assert(subj?.lat == null && subj?.lng == null, `coord-mismatch nulls the wrong coordinate (got ${subj?.lat},${subj?.lng})`);
assert(/coord-rejected/.test(subj?.provenance ?? ''), `coord-mismatch recorded in provenance`);
const par = cr.ancestors.find((a) => a.id === '@I2@');
assert(par?.lat != null && par?.lng != null, `consistent coord is kept (got ${par?.lat},${par?.lng})`);

const crCov = cr.report.coverage;
const crTotal = crCov.resolvedWeight + crCov.unresolvedWeight + crCov.gapWeight;
assert(Math.abs(crTotal - 1) < 1e-9, `coord-validation tree coverage sums to 1 (got ${crTotal})`);

// Place entity resolution: the many string variants of one country collapse into a
// single canonical entity (with variants kept as evidence), while meaningful
// distinctions (England vs Scotland) are preserved — six leaves, four US variants.
const mkLeaf = (id: string, place: string, lat: string, lng: string) =>
  [`0 ${id} INDI`, `1 NAME X /${id}/`, '1 BIRT', `2 PLAC ${place}`, '3 MAP', `4 LATI ${lat}`, `4 LONG ${lng}`];
const canonGed = [
  '0 HEAD', '1 GEDC', '2 VERS 7.0',
  '0 @I1@ INDI', '1 NAME Home /Person/', '1 FAMC @F1@',
  '0 @I2@ INDI', '1 FAMC @F2@',
  '0 @I3@ INDI', '1 FAMC @F3@',
  '0 @I4@ INDI', '1 FAMC @F4@',
  '0 @I5@ INDI', '1 FAMC @F5@',
  ...mkLeaf('@I6@', 'USA', 'N39.0', 'W98.0'),
  ...mkLeaf('@I7@', 'US', 'N39.0', 'W98.0'),
  ...mkLeaf('@I8@', 'United States of America', 'N39.0', 'W98.0'),
  ...mkLeaf('@I9@', 'Va', 'N39.0', 'W98.0'),
  ...mkLeaf('@I10@', 'England', 'N52.5', 'W1.5'),
  ...mkLeaf('@I11@', 'Scotland', 'N56.8', 'W4.2'),
  '0 @F1@ FAM', '1 HUSB @I2@', '1 WIFE @I3@', '1 CHIL @I1@',
  '0 @F2@ FAM', '1 HUSB @I4@', '1 WIFE @I5@', '1 CHIL @I2@',
  '0 @F3@ FAM', '1 HUSB @I6@', '1 WIFE @I7@', '1 CHIL @I3@',
  '0 @F4@ FAM', '1 HUSB @I8@', '1 WIFE @I9@', '1 CHIL @I4@',
  '0 @F5@ FAM', '1 HUSB @I10@', '1 WIFE @I11@', '1 CHIL @I5@',
  '0 TRLR', '',
].join('\n');
const cz = await analyze(canonGed);
const modern = cz.report.breakdown.fractional.modernCountry ?? [];
const usLines = modern.filter((s) => s.region === 'United States');
assert(usLines.length === 1, `US variants collapse to ONE entity (got lines: ${modern.map((s) => s.region).join(', ')})`);
assert(!modern.some((s) => ['USA', 'US', 'Va', 'United States of America'].includes(s.region)), `no raw US-variant lines remain`);
assert(modern.some((s) => s.region === 'England') && modern.some((s) => s.region === 'Scotland'), `England and Scotland stay distinct`);
const usVariants = cz.report.placeVariants['United States'] ?? [];
assert(usVariants.includes('USA') && usVariants.includes('Va'), `placeVariants records US evidence (got ${usVariants.join(', ')})`);
const czCov = cz.report.coverage;
assert(Math.abs(czCov.resolvedWeight + czCov.unresolvedWeight + czCov.gapWeight - 1) < 1e-9, `entity-resolution tree coverage sums to 1`);

// Overlap declutter: the four US ancestors share one geocode (N39/W98), so their
// markers would stack into a single dot. buildLayers must spread them apart —
// deterministically, bounded, with the heaviest keeping the true coordinate — while
// leaving singleton placements (England, Scotland) exactly where the record puts them.
const czLayers = buildLayers(cz.ancestors, cz.links, 8);
const usPts = czLayers.points.filter((p) => p.region === 'United States');
const usDistinct = new Set(usPts.map((p) => `${p.lat},${p.lng}`));
assert(usPts.length === 4 && usDistinct.size === 4, `co-located markers spread to distinct positions (got ${usDistinct.size}/4)`);
const atTrue = usPts.filter((p) => p.lat === 39 && p.lng === -98);
assert(atTrue.length === 1, `exactly one spread marker anchors the true coordinate (got ${atTrue.length})`);
assert(atTrue[0]!.weight === Math.max(...usPts.map((p) => p.weight)), `the heaviest member keeps the true coordinate`);
assert(usPts.every((p) => Math.abs(p.lat - 39) <= 0.4 && Math.abs(p.lng + 98) <= 0.6), `spread offsets stay bounded (sub-city scale)`);
const engPt = czLayers.points.find((p) => p.region === 'England');
assert(engPt?.lat === 52.5 && engPt?.lng === -1.5, `singleton markers are not moved (got ${engPt?.lat},${engPt?.lng})`);

// Arcs must land on the (spread) dot positions, not the raw coordinates.
const posSet = new Set(full.points.map((p) => `${p.lat},${p.lng}`));
assert(full.arcs.every((a) => posSet.has(`${a.startLat},${a.startLng}`) && posSet.has(`${a.endLat},${a.endLng}`)),
  `every arc endpoint coincides with a marker position`);

// Historical-coord sanity: an ancient place name with a wildly-off coord (Edom in
// South Africa) drops the coord but keeps the label.
const ancientGed = [
  '0 HEAD', '1 GEDC', '2 VERS 7.0',
  '0 @I1@ INDI', '1 NAME Anc /Subject/',
  '1 BIRT', '2 PLAC Edom (Idumaea)', '3 MAP', '4 LATI S29.0', '4 LONG E24.0', // point in South Africa
  '0 TRLR', '',
].join('\n');
const az = await analyze(ancientGed);
const asubj = az.ancestors.find((a) => a.id === '@I1@');
assert(asubj?.lat == null && asubj?.lng == null, `ancient mismatch drops the coordinate (got ${asubj?.lat},${asubj?.lng})`);
assert(/coord-rejected:ancient/.test(asubj?.provenance ?? ''), `ancient mismatch recorded in provenance`);

// ---- Stage-2 coverage invariant under pedigree collapse + depth cap ----
// Regression for the buildPedigree weight double-count. These need exact control over
// topology + cap, so they drive buildPedigree/aggregate directly off a synthetic tree
// (place strings omitted: every leaf is unresolved, which is fine — the invariant is
// resolved + unresolved + gap === 1 regardless of where the weight lands).
type FamSpec = { husband?: string; wife?: string };
function synthTree(people: string[], childOf: Record<string, string>, families: Record<string, FamSpec>): ParsedTree {
  const individuals = new Map<string, Individual>();
  for (const id of people) {
    individuals.set(id, { id, given: id, surname: null, sex: 'U', events: [], famc: childOf[id] ? [childOf[id]!] : [], fams: [] });
  }
  const fams = new Map<string, Family>();
  for (const [fid, f] of Object.entries(families)) {
    fams.set(fid, { id: fid, husband: f.husband ?? null, wife: f.wife ?? null, children: [] });
  }
  return { individuals, families: fams };
}
const covSum = (c: { resolvedWeight: number; unresolvedWeight: number; gapWeight: number }) =>
  c.resolvedWeight + c.unresolvedWeight + c.gapWeight;

// Collapse + cap: X sits at depth 2 (recurses into its parents Y,Z) AND at depth 3 (== cap,
// truncated leaf). The bug counted X's shallow pass twice — once as X's own leaf weight,
// once via Y,Z — so coverage summed to 1.25. Each slot-weight must be partitioned once.
const CAP = 3;
const collapseTree = synthTree(
  ['I1', 'A', 'B', 'C', 'D', 'E', 'G', 'X', 'Y', 'Z'],
  { I1: 'F1', A: 'F2', B: 'F3', D: 'F4', X: 'F5' },
  {
    F1: { husband: 'A', wife: 'B' },
    F2: { husband: 'X', wife: 'C' }, // X is A's father -> X reached at depth 2 (recurses)
    F3: { husband: 'D', wife: 'E' },
    F4: { husband: 'X', wife: 'G' }, // X is D's father -> X reached at depth 3 (== cap, leaf)
    F5: { husband: 'Y', wife: 'Z' }, // X's own parents  -> the below-cap recursion target
  },
);
const collapseDag = buildPedigree(collapseTree, 'I1', CAP);
const xNode = collapseDag.nodes.get('X');
assert(xNode != null && xNode.depths.some((d) => d < CAP) && xNode.depths.includes(CAP),
  `collapsed X is reached below the cap AND at it (depths ${xNode?.depths.join(',')})`);
const collapseSum = covSum(aggregate(collapseDag, new StubResolver()).coverage);
assert(Math.abs(collapseSum - 1) < 1e-9, `collapse+cap coverage sums to 1 (got ${collapseSum})`);

// Cyclic edge (a person as their own ancestor): the slot we can't follow without looping
// must be conserved as a gap, not silently dropped. The bug summed coverage to 0.75.
const cycleTree = synthTree(
  ['I1', 'P', 'Q', 'R'],
  { I1: 'F1', P: 'F2' },
  { F1: { husband: 'P', wife: 'Q' }, F2: { husband: 'I1', wife: 'R' } }, // P's father is I1 -> cycle
);
const cycleCov = aggregate(buildPedigree(cycleTree, 'I1', 8), new StubResolver()).coverage;
assert(Math.abs(covSum(cycleCov) - 1) < 1e-9, `cyclic-edge coverage sums to 1 (got ${covSum(cycleCov)})`);
assert(cycleCov.gapWeight > 0, `cyclic slot conserved as gap weight, not dropped (got ${cycleCov.gapWeight})`);

console.log('\nALL SMOKE CHECKS PASSED');
