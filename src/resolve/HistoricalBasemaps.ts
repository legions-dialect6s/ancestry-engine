// Historical boundaries: given (lat, lng, year), which polity controlled that point?
//
// This is the historical-basemaps half of stage 3. The real data is per-year world
// GeoJSON from github.com/aourednik/historical-basemaps, whose features carry NAME,
// SUBJECTO (controlling power), PARTOF (cultural area), and BORDERPRECISION. Here we
// model the same shape with coarse bounding-box polygons for the demo years so it
// runs; in production you load the real GeoJSON FeatureCollections and (for speed at
// scale) put the polygons in an R-tree such as rbush before the point-in-polygon test.

import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { Feature, Polygon } from 'geojson';

export interface PolityHit {
  name: string;
  subjecto: string;
  partOf: string | null;
  borderPrecision: 1 | 2 | 3;
  snapshotYear: number;
}

export interface HistoricalBoundaries {
  availableYears: number[];
  resolve(lat: number, lng: number, year: number): PolityHit | null;
}

interface Polity {
  name: string;
  subjecto: string;
  partOf: string | null;
  borderPrecision: 1 | 2 | 3;
  /** [west, south, east, north] — demo stand-in for a real polygon. */
  bbox: [number, number, number, number];
}

interface Snapshot { year: number; polities: Polity[] }

function bboxPolygon(b: [number, number, number, number]): Feature<Polygon> {
  const [w, s, e, n] = b;
  return {
    type: 'Feature', properties: {},
    geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
  };
}

export class HistoricalBasemaps implements HistoricalBoundaries {
  readonly availableYears: number[];
  constructor(private readonly snapshots: Snapshot[]) {
    this.availableYears = snapshots.map((s) => s.year).sort((a, b) => a - b);
  }

  /** The applicable snapshot is the latest one at or before the event year
   *  (a snapshot holds until the next one), falling back to the earliest. */
  private snapshotFor(year: number): Snapshot {
    let chosen = this.snapshots[0]!;
    for (const s of this.snapshots) if (s.year <= year && s.year >= chosen.year) chosen = s;
    if (year < chosen.year) {
      chosen = [...this.snapshots].sort((a, b) => a.year - b.year)[0]!;
    }
    return chosen;
  }

  resolve(lat: number, lng: number, year: number): PolityHit | null {
    const snap = this.snapshotFor(year);
    for (const p of snap.polities) {
      if (booleanPointInPolygon([lng, lat], bboxPolygon(p.bbox))) {
        return { name: p.name, subjecto: p.subjecto, partOf: p.partOf, borderPrecision: p.borderPrecision, snapshotYear: snap.year };
      }
    }
    return null;
  }
}

// Sample snapshots (coarse boxes; BORDERPRECISION = 2 "moderate" by design, since
// these are approximate). Ordered so finer/peripheral polities resolve correctly.
const GERMAN: Polity = { name: 'German Empire', subjecto: 'German Empire', partOf: 'Germanic', borderPrecision: 2, bbox: [6, 47, 15, 55] };
const AUSTRIA_HUNGARY: Polity = { name: 'Austria-Hungary', subjecto: 'Austria-Hungary', partOf: 'Central Europe', borderPrecision: 2, bbox: [9, 44, 27, 51] };
const NORWAY: Polity = { name: 'Norway', subjecto: 'Norway', partOf: 'Nordic', borderPrecision: 2, bbox: [4, 58, 13, 72] };
const SWEDEN: Polity = { name: 'Sweden', subjecto: 'Sweden', partOf: 'Nordic', borderPrecision: 2, bbox: [11, 55, 24, 69] };
const RUSSIAN_EMPIRE: Polity = { name: 'Russian Empire', subjecto: 'Russian Empire', partOf: 'Eastern Europe', borderPrecision: 2, bbox: [20, 54, 60, 71] };
const GERMANY: Polity = { name: 'Germany', subjecto: 'Germany', partOf: 'Germanic', borderPrecision: 2, bbox: [6, 47, 15, 55] };
const CZECHOSLOVAKIA: Polity = { name: 'Czechoslovakia', subjecto: 'Czechoslovakia', partOf: 'Central Europe', borderPrecision: 2, bbox: [12, 47, 23, 51] };
const FINLAND: Polity = { name: 'Finland', subjecto: 'Finland', partOf: 'Nordic', borderPrecision: 2, bbox: [19, 59, 32, 71] };

export const SAMPLE_BOUNDARIES: Snapshot[] = [
  { year: 1880, polities: [GERMAN, AUSTRIA_HUNGARY, NORWAY, SWEDEN, RUSSIAN_EMPIRE] },
  { year: 1914, polities: [GERMAN, AUSTRIA_HUNGARY, NORWAY, SWEDEN, RUSSIAN_EMPIRE] },
  { year: 1925, polities: [GERMANY, CZECHOSLOVAKIA, NORWAY, SWEDEN, FINLAND] },
];
