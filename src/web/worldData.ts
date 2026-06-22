// Country-border base map for the globe. The data and the point-in-polygon logic live
// in the resolve layer (src/resolve/ModernBorders.ts), which both the renderer and the
// coordinate-validation step share; the web only consumes it, never the other way
// around. This thin re-export keeps GlobeView's import (`./worldData`) stable.
//
// Still MODERN borders (Natural Earth 110m) — the on-ramp to Task 1's historical
// per-year basemaps. When that lands, swap the source feeding ModernBorders.

export { WORLD_COUNTRIES, type CountryFeature } from '../resolve/ModernBorders';
