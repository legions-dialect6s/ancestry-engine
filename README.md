# ancestry-engine

## What this is

An entity-resolution and ontology engine for adversarially messy real-world data, demonstrated on genealogy — one of the messiest domains there is (free-text place names, historical spellings, borders that move under the data, missing links). It reconstructs canonical real-world entities from place-string variants, treats uncertainty and provenance as first-class, and renders the result as a 3D geoscape. The proving ground is a 31k-record family tree; the model is the product, the globe is one view onto it.

- **Entity resolution** — raw place strings reconciled to canonical places, keeping the variants as evidence.
- **Provenance on every value** — each resolved place carries how and why it resolved, not just the answer.
- **Derived properties over the graph** — fractional makeup, contribution weight, and coverage are computed from the pedigree DAG, never denormalized onto records.
- **Uncertainty as a first-class coverage budget** — `resolved + unresolved + gap = 1`; the unknown is reported, never normalized away.
- **Swappable resolvers behind stable contracts** — each pipeline stage is a port; implementations deepen without touching the rest.

---

Genealogy-based ancestry analysis with **first-class uncertainty** and **historical place resolution**. Feed it a family tree (GEDCOM); it tells you where your documented ancestors came from — weighted like a DNA breakdown but built from paper records — and it is honest about everything it *can't* account for.

> This is **genealogy, not genetics.** It reads a documented pedigree, so it inherits every brick wall and cannot detect a break in the biological line. It is not a DNA test and not a "23andMe alternative." What it does that consumer tools don't: it shows you the gaps instead of averaging them away.

## Why it's interesting (the hard parts)

- **Ancestry is a DAG, not a tree.** Pedigree collapse (cousin marriages, endogamy) puts one person in multiple slots. Their contribution is summed across every path that reaches them.
- **Uncertainty is a value, not an absence.** Missing parents become explicit `Gap` nodes that carry the weight of the slot they fill. Coverage (`resolved + unresolved + gap`) sums to exactly 1.
- **Historical place resolution.** "Lemberg, Austria, 1881" is not modern Ukraine politically — it was Austria-Hungary at that date. Resolving free-text, period-dependent place names against shifting borders is the core problem (see roadmap).
- **Two honest lenses.** *Fractional* makeup (share of you, attributed at the leaves of the known tree) and *headcount* (how many documented ancestors per region) answer different questions and routinely disagree.

## Architecture

A pipeline of five stages, each a port with a stable output type. Implementations deepen behind fixed contracts, so upgrading one stage touches nothing downstream.

| Stage | Contract | Now (checkpoint) | Later |
|---|---|---|---|
| 1 Ingest | `Source -> ParsedTree` | dependency-free GEDCOM parser (5.5.1/7 subset) | `read-gedcom`, FamilySearch API adapter |
| 2 Pedigree | `ParsedTree + root -> AncestorDAG` | DAG walk, collapse dedupe, gap nodes, cycle guard | adoption flags, per-link confidence |
| 3 Resolve | `(place, year) -> ResolvedPlace` | **stub:** alias map -> modern country | GeoNames geocode -> temporal point-in-polygon -> cultural region -> confidence |
| 4 Aggregate | `AncestorDAG + Resolver -> AncestryReport` | fractional + headcount + coverage | historical polity, migration over epochs, Monte Carlo |
| 5 Visualize | `AncestryReport -> views` | (CLI summary) | fan chart (gaps = blank wedges), migration map, drill-down |

The whole point of the checkpoint: the **stub resolver is the only disposable piece.** Everything else is the real implementation. Swap `StubResolver` for the geocoding pipeline and nothing else changes.

## Methodology decisions (the README is the interview)

**Weighting.** Each parent step halves contribution; an ancestor reached by a path of length `L` contributes `(1/2)^L` per path, summed across paths under collapse.

**Leaf attribution.** Fractional makeup is attributed at *leaves* — the most distant known ancestor on each line — because a leaf represents its whole unexplored branch. A line traced only to a great-grandparent (depth 3, weight 1/8) counts for more than one traced to depth 8 (weight 1/256). That's correct: a nearer unknown is more of you.

**Coverage partition.** Every known person either recurses into known parents, terminates as a leaf, or spawns a gap for a missing parent. Leaf weights + gap weights = 1, so the uncertainty budget is exact, not estimated.

**Fractional shares intentionally don't sum to 100%.** The remainder is the uncertainty. Normalizing it away would be the dishonest move every consumer tool makes.

## Roadmap (deepening order)

1. **Real resolver** — geocode place strings with [GeoNames](https://www.geonames.org/), then point-in-polygon against [`aourednik/historical-basemaps`](https://github.com/aourednik/historical-basemaps) for the event year. That dataset ships per-year world GeoJSON with `SUBJECTO` (controlling power -> choropleth color), `PARTOF` (cultural grouping), and `BORDERPRECISION` (1 approximate .. 3 legally-defined -> drives blur in the uncertainty viz). Caveat the dataset states: national boundaries only cohere in Europe after the Peace of Westphalia (1648) — fine for a typical 8-generation tree.
2. Fan chart with `Gap` nodes as blank wedges and low border precision as blur.
3. Cultural-region grouping + migration timeline.
4. Confidence propagation + Monte Carlo over ambiguous resolutions (distributions, not point estimates).
5. FamilySearch API source adapter / multi-source merge.

## Privacy

Parse, graph, and visualization run client-side in the web build (planned): your tree never leaves your device. A GEDCOM contains PII of *living* relatives — never store or upload real trees in a public demo. If the resolver ever moves server-side, it receives only normalized place strings + dates, never names.

## Run

```bash
npm install
npm run dev         # CLI: parses src/demo/sample.ged, prints the report + temporal resolution
npm run smoke       # unit checks on the pure wiring (coverage sums to 1, depth filter, etc.)
npm run typecheck
npm run dev:web     # geoscape UI (Vite) — rotatable globe + corner HUD, runs the engine client-side
npm run build:web   # production bundle
```

### Geoscape UI (skeleton)

`src/web/` is the wiring skeleton: `analyze()` runs the whole pipeline in the browser (your tree never leaves the device), `globeData.ts` turns the result into globe layers (markers sized by contribution weight, migration arcs, a "look back N generations" filter), and the HUD binds to the `AncestryReport` with the uncertainty figure rendered as a first-class corner stat. Markers: amber = leaves (terminal known ancestors), cyan = interior. Click a marker for that ancestor's resolution provenance.

Visual craft (custom globe material, Fresnel atmosphere, bloom, hexbin density heatmap, responsive polish) is marked with `TODO(craft)` and intended for the Claude Code loop, where a live dev server makes iteration fast. Tokens live in `src/web/theme.ts`.

## Golden test set

Hard places that drive the resolver and make the demo: Lemberg/Lwów/Lviv, Königsberg/Kaliningrad, Danzig/Gdańsk, Pressburg/Bratislava, Åbo/Turku, Christiania/Oslo, Bohemia, Austria-Hungary. The stub maps these to *modern* countries on purpose — the difference between that and the period-correct polity is exactly what stage 3 exists to fix.
