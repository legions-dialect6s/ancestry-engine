import { useRef, useEffect, useMemo, type ComponentType } from 'react';
import Globe from 'react-globe.gl';
import { theme, withAlpha } from './theme';
import type { PointDatum, ArcDatum } from './globeData';
import { WORLD_COUNTRIES } from './worldData';
import {
  makeGlobeMaterial,
  makeAtmosphere,
  makeGraticule,
  attachBloom,
  disposeObject,
  type GlobeHandle,
} from './globeCraft';

// react-globe.gl ships a huge prop surface; we type our usage loosely on purpose so
// this skeleton compiles cleanly. Props below follow its documented API.
const GlobeAny = Globe as unknown as ComponentType<any>;

interface Props {
  points: PointDatum[];
  arcs: ArcDatum[];
  onSelect: (id: string) => void;
}

export function GlobeView({ points, arcs, onSelect }: Props) {
  const ref = useRef<any>(null);

  // Custom dark globe material, memoized so it survives re-renders.
  const globeMaterial = useMemo(() => makeGlobeMaterial(), []);

  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const controls = g.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.enableDamping = true;
    g.pointOfView({ lat: 55, lng: 12, altitude: 2.2 }, 0);

    // Craft pass: graticule + Fresnel atmosphere added to the scene, bloom on the
    // post-processing composer. Guarded because the underlying globe.gl handle wires
    // these lazily on first frame.
    const globe = g as GlobeHandle & { scene: () => { add: (o: unknown) => void; remove: (o: unknown) => void } };
    const radius = globe.getGlobeRadius();
    const scene = g.scene();

    const graticule = makeGraticule(globe);
    const atmosphere = makeAtmosphere(radius);
    scene.add(graticule);
    scene.add(atmosphere);

    const bloom = attachBloom(globe, window.innerWidth, window.innerHeight);

    return () => {
      scene.remove(graticule);
      scene.remove(atmosphere);
      disposeObject(graticule);
      disposeObject(atmosphere);
      bloom?.dispose();
    };
  }, []);

  return (
    <GlobeAny
      ref={ref}
      width={typeof window !== 'undefined' ? window.innerWidth : 800}
      height={typeof window !== 'undefined' ? window.innerHeight : 600}
      backgroundColor="rgba(0,0,0,0)"
      // Craft: no bitmap — a custom dark globe ShaderMaterial (see globeCraft.ts)
      // carries a cyan Fresnel limb; the graticule, Fresnel atmosphere shell, and
      // UnrealBloomPass are added to the scene/composer in the effect above.
      globeMaterial={globeMaterial}
      showAtmosphere={false}
      // Country-border base map (modern Natural Earth 110m; on-ramp to historical
      // basemaps). Hairline cyan borders over a near-invisible cyan fill, seated just
      // above the surface so it stays beneath the ancestor markers and arcs.
      polygonsData={WORLD_COUNTRIES}
      polygonAltitude={0.006}
      polygonCapColor={() => withAlpha(theme.accentCyan, 0.05)}
      polygonSideColor={() => withAlpha(theme.accentCyan, 0.08)}
      polygonStrokeColor={() => withAlpha(theme.accentCyan, 0.55)}
      polygonsTransitionDuration={0}
      // Ancestors as markers: leaves (terminal known ancestors) in amber, interior in
      // cyan; altitude scales with contribution weight so "more of you" stands taller.
      pointsData={points}
      pointLat="lat"
      pointLng="lng"
      pointAltitude={(d: PointDatum) => 0.02 + d.weight * 0.6}
      pointRadius={(d: PointDatum) => (d.isLeaf ? 0.34 : 0.2)}
      pointColor={(d: PointDatum) => (d.isLeaf ? theme.accentAmber : theme.accentCyan)}
      pointLabel={(d: PointDatum) => d.label}
      onPointClick={(d: PointDatum) => onSelect(d.id)}
      // Migration arcs child -> parent.
      arcsData={arcs}
      arcStartLat="startLat"
      arcStartLng="startLng"
      arcEndLat="endLat"
      arcEndLng="endLng"
      arcColor={() => [`${theme.accentAmber}00`, `${theme.accentAmber}cc`]}
      arcStroke={0.4}
      arcDashLength={0.4}
      arcDashGap={0.25}
      arcDashAnimateTime={4500}
      // TODO(craft): hexBin density heatmap layer keyed on weight, toggled in the HUD.
    />
  );
}
