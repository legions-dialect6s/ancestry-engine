# VISION — ancestry-engine

## Ethos

Turn adversarially messy real-world data into a semantically meaningful model, resolve the
entities honestly, quantify what you don't know, and make the result legible.

The loop: **messy records → ontology → entity resolution → derived insight → honest uncertainty → repeat.**

---

## Strategic frame

This is not "a genealogy app." It is an **entity-resolution and ontology engine for
adversarially messy real-world data**, demonstrated on genealogy — one of the messiest
domains there is (free-text places, name variants, conflicting dates, duplicate people,
borders that move under the data).

The globe is one *view* onto the model. The model is the product. The same engine that
resolves tens of thousands of place-string variants into canonical real-world places would
resolve any messy entity corpus; genealogy is the proving ground, not the ceiling.

---

## The ontology

Each entity lists its attributes, then how it relates to the others. The relationships are
where the value lives — they're what let you ask questions a flat file can't, like *"what
share of me resolves to one canonical place across all of its historical names?"* or
*"which lines dead-end in gaps versus merely-unresolved strings?"*

### Person
Attributes: name(s), birth/death events, source IDs.
- **child of** → Family
- **occupies** → one or more positions in the AncestorDAG (pedigree collapse: the same real
  person can sit in multiple lineage slots)

### Family
Attributes: a couple and their children.
- **links** Person (parent) → Person (child)

### Place
Attributes: canonical name, coordinates, modern country, historical polity (time-varying),
the variant strings seen (evidence), confidence, provenance.
- **resolved from** → many raw place strings (this edge *is* entity resolution)

### EthnoculturalGroup *(future — documented, not built)*
A diaspora / people identity that crosses national borders (e.g. Ashkenazi, Roma, Armenian).
Attributes: evidence[], confidence, provenance — never a hard label from a surname alone.
- **inferred for** → Person

### AncestorDAG
The derived pedigree graph rooted at the focal descendant. Nodes are Persons, edges are
parent links; handles collapse and first-class gap nodes.

---

## Operating principles (the engine's primitives)

The repo embodies a small set of ontology primitives. Every one of these is a real
engineering property of the code, not a slogan:

- **Entity resolution** — canonical Place (and later Person) entities reconstructed from
  messy variants, keeping the variants as evidence.
- **Domain-driven design** — model the real-world concept (Person, Place, the DAG), not the
  shape of the upstream GEDCOM rows.
- **Structs + provenance** — a resolved Place travels as one value carrying its own metadata
  and lineage; every value remembers where it came from.
- **Derived properties** — fractional makeup, contribution weight, and coverage are computed
  over the graph, never denormalized onto records.
- **Reducers** — when a property has many candidate values (historical border snapshots,
  conflicting source dates), bubble up the most relevant while keeping the rest.
- **Open for extension, closed for modification** — capability deepens behind stable stage
  contracts; resolvers are swappable plug-and-play interfaces.

---

## Proof metrics (always before/after vs. baseline)

- **Resolved coverage** — resolved + unresolved + gap = 100%. Uncertainty is never hidden or
  normalized away.
- **Variants → entities** — raw place strings collapsed to canonical Place entities (e.g.
  ~26,700 strings → N entities), with entity-resolution precision held high.
- **Scale** — depth and collapse handled on a 31k-record real tree without breaking the
  coverage invariant.

---

## Build principle

Every feature must either:

**(a) extend the ontology** — add or refine an entity, attribute, relationship, or
resolution, or

**(b) build a view or tool on top of it** that drives a measurable lift (coverage,
entity-resolution quality, legibility).

If a proposed feature does neither, it is scope creep. Prefer finishing and proving one
resolver over starting three. Uncertainty stays first-class: never normalize a gap away to
make a number look clean.

The ontology is a living map. If the data turns out to work differently than modeled, update
the ontology — don't force reality to fit the doc.

---

## Current scope (do not get ahead of this)

> **Now:** embedded-coordinate parsing, then **place** entity resolution (canonicalizing the
> raw place strings into Place entities with variants-as-evidence, confidence, and provenance).
>
> **Not yet:** person-level entity resolution (the duplicate-vs-collapse merge) and the
> EthnoculturalGroup layer. They are documented above to show where they fit in the model —
> do **not** build, wire, or connect them until they are explicitly scoped in a future
> session. Prove the place layer first.
