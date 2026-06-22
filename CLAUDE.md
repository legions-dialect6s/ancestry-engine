# CLAUDE.md — ancestry-engine
Read VISION.md first.

Genealogy-based ancestry analysis with first-class uncertainty and historical place resolution. Reads a GEDCOM, tells you where your *documented* ancestors came from (weighted like a DNA breakdown but from paper records), and is honest about what it can't account for.

**Framing rule:** this is genealogy, not genetics. Never describe it as a DNA test or a "23andMe alternative" — in code comments, README, or UI copy. The differentiator is showing the gaps, not hiding them.

## Run

```bash
npm install
npm run dev         # CLI: sample tree -> report + temporal resolution
npm run smoke       # automated checks on the pure wiring — KEEP THIS GREEN
npm run typecheck   # strict; must stay clean
npm run dev:web     # geoscape UI (Vite), engine runs client-side
npm run build:web   # production bundle
```

## Architecture — five stages, each a port with a stable output type

| Stage | Contract (do not casually change) | File |
|---|---|---|
| Ingest | `Source -> ParsedTree` | `src/ingest/` |
| Pedigree | `ParsedTree + root -> AncestorDAG` | `src/pedigree/` |
| Resolve | `(place, year) -> ResolvedPlace` | `src/resolve/` |
| Aggregate | `AncestorDAG + Resolver -> AncestryReport` | `src/aggregate/` |
| Visualize | `AncestryReport -> views` | `src/web/` |

`src/analyze.ts` wires the pipeline end-to-end and is the single entry both CLI and browser call.

## Invariants — these must not drift

1. **Implementations deepen behind fixed ports.** New capability goes *behind* a stage interface; it does not change the interface or leak into other stages.
2. **The resolver is swappable.** `aggregate` and the views must work with any `Resolver`. `StubResolver` and `HistoricalResolver` are interchangeable by construction — keep it that way.
3. **`coverage.resolvedWeight + unresolvedWeight + gapWeight === 1`.** The smoke test asserts this. If a change breaks it, the change is wrong.
4. **Fractional shares are "of you" and intentionally do NOT sum to 1.** The remainder is the uncertainty in `coverage`. Never normalize it away.
5. **Gaps are first-class.** Missing parents become `GapNode`s carrying weight. Never silently drop a missing ancestor.
6. **Provenance on every `ResolvedPlace`.** Every resolution records why. Don't remove it.
7. **Privacy.** Parse + DAG + viz stay client-side; the tree never leaves the device. A real GEDCOM is PII of living relatives — **never commit one** (see `data/` in .gitignore). Demo/tests use `src/demo/sample.ged` or synthetic data only.

## Current state

Checkpoint complete: real resolver (geocode + temporal point-in-polygon) running on **sample** datasets, full pipeline green, web skeleton wired (globe + corner HUD + look-back slider + selection). Visual craft is stubbed with `TODO(craft)` markers.

## Task loop (suggested order)

1. **Real datasets** (highest value):
   - Replace `SAMPLE_BOUNDARIES` with real per-year GeoJSON from `github.com/aourednik/historical-basemaps` (use `NAME`/`SUBJECTO`/`PARTOF`/`BORDERPRECISION`). Simplify with `mapshaper` at build to keep it web-weight.
   - Replace `SAMPLE_GAZETTEER` with a GeoNames extract (cities + `alternateNames` for historical spellings).
   - Add an `rbush` (or flatbush) spatial index before the point-in-polygon test in `HistoricalBasemaps`.
2. **Golden tests** — Lemberg/Lwów/Lviv, Königsberg/Kaliningrad, Danzig/Gdańsk, Pressburg/Bratislava, Åbo/Turku, Christiania/Oslo, Bohemia, Austria-Hungary all resolve to the period-correct polity. Extend `scripts/smoke.ts`.
3. **Visual craft** (the `TODO(craft)` hooks in `GlobeView.tsx`): custom dark globe material + graticule, Fresnel atmosphere shader, `UnrealBloomPass`, a hexbin density heatmap layer toggle, selection glow. Then responsive/mobile, visible focus, reduced-motion. Tokens are in `src/web/theme.ts` — derive from them, don't invent new colors. Deploy as a static site.
4. **Later:** confidence propagation through aggregation; Monte Carlo over ambiguous resolutions for distributions instead of point estimates; FamilySearch API `Source` adapter.

## Conventions

- TypeScript strict + `noUncheckedIndexedAccess`. Keep transforms pure where possible (everything in `globeData.ts` is pure and testable).
- After any change, run `npm run typecheck && npm run smoke` before considering it done.
- No browser storage APIs needed; state is in React.
