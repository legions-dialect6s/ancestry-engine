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

console.log('\nALL SMOKE CHECKS PASSED');
