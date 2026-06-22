// Smoke test for the pure wiring layer (no WebGL). Run: npm run smoke
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { analyze } from '../src/analyze';
import { buildLayers, placed, filterByDepth } from '../src/web/globeData';

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

console.log('\nALL SMOKE CHECKS PASSED');
