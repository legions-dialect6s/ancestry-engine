// Modern country borders — a base map under the ancestor markers so the globe reads
// as a map, not just a void with dots. Source: Natural Earth 110m admin-0 countries
// (nvkelso/natural-earth-vector), vendored into assets/ with properties stripped to
// `name` and coordinates rounded to ~2dp to stay web-weight (~170KB). Task 1 will
// replace this hand-vendored asset with a mapshaper build step.
//
// This is deliberately MODERN borders as the on-ramp to Task 1 (historical
// per-year basemaps from aourednik/historical-basemaps). When that lands, swap the
// source feeding this module for a year-indexed FeatureCollection — the polygon
// layer in GlobeView stays as-is.

import type { Feature, Polygon, MultiPolygon } from 'geojson';
import raw from './assets/countries-110m.json';

export type CountryFeature = Feature<Polygon | MultiPolygon, { name: string }>;

export const WORLD_COUNTRIES: CountryFeature[] = (
  raw as unknown as { features: CountryFeature[] }
).features;
