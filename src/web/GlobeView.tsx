import { useRef, useEffect, useMemo, useState, type ComponentType } from 'react';
import Globe from 'react-globe.gl';
import { theme, withAlpha, mix } from './theme';
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
  /** A marker id selects; null clears (empty-space click). */
  onSelect: (id: string | null) => void;
}

// Arc grading. Long migrations glow warm amber — the hero "crossing" color — while
// shorter arcs grade by depth (recent warm -> deep cool), so the ocean sweeps pop
// warm against the cooler local web. Brightness is keyed to SALIENCE, not depth: a
// long-haul migration is drawn bright even when it's deep and low-weight, so the
// striking transoceanic arcs don't fade out. Short arcs brighten with weight.
const ARC_DEPTH_REF = 12; // hue is fully cool by this generation
const ARC_BRIGHT_WEIGHT = 0.2; // weight at which a short arc reaches full opacity
const ARC_LONGHAUL_OPACITY = 0.6; // brightness floor for migration arcs

function arcEndpointColors(d: ArcDatum): [string, string] {
  const hue = d.longHaul
    ? theme.accentAmber
    : mix(theme.accentAmber, theme.accentCyan, Math.min(1, d.depth / ARC_DEPTH_REF));
  let opacity = 0.3 + 0.6 * Math.min(1, Math.sqrt(d.weight / ARC_BRIGHT_WEIGHT));
  if (d.longHaul) opacity = Math.max(opacity, ARC_LONGHAUL_OPACITY);
  // Dashed gradient: transparent at the child end, graded color at the parent end.
  return [withAlpha(hue, 0), withAlpha(hue, opacity)];
}

export function GlobeView({ points, arcs, onSelect }: Props) {
  const ref = useRef<any>(null);

  // Custom dark globe material, memoized so it survives re-renders.
  const globeMaterial = useMemo(() => makeGlobeMaterial(), []);

  // Viewport-driven canvas size. The old code read window.inner* once at mount and
  // never updated, so resizing (Safari especially, on toolbar show/hide and rotation)
  // left a clipped canvas. react-globe.gl (three-render-objects) resizes the renderer,
  // post-processing composer, and camera when these props change, so we just keep them
  // synced to the window — debounced so a drag-resize doesn't thrash the renderer.
  const [size, setSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 800,
    h: typeof window !== 'undefined' ? window.innerHeight : 600,
  }));

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => setSize({ w: window.innerWidth, h: window.innerHeight }), 150);
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, []);

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

    // Ambient auto-rotate that yields to the user. The constant spin makes markers
    // impossible to hover/click, so any interaction (drag, wheel, pointerdown) or
    // simply hovering the globe pauses rotation; it resumes ~4s after the pointer
    // goes idle AND has left, so the globe never spins out from under the cursor.
    const canvas: HTMLCanvasElement = g.renderer().domElement;
    const IDLE_MS = 4000;
    let hovering = false;
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
      controls.autoRotate = false;
      if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = undefined; }
    };
    const armResume = () => {
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        resumeTimer = undefined;
        if (!hovering) controls.autoRotate = true;
      }, IDLE_MS);
    };
    const onMove = () => { hovering = true; stop(); };
    const onLeave = () => { hovering = false; armResume(); };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', stop);
    canvas.addEventListener('wheel', stop, { passive: true });
    controls.addEventListener('start', stop); // OrbitControls: drag/zoom begins
    controls.addEventListener('end', armResume); // drag/zoom ends -> idle countdown

    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', stop);
      canvas.removeEventListener('wheel', stop);
      controls.removeEventListener('start', stop);
      controls.removeEventListener('end', armResume);
      if (resumeTimer) clearTimeout(resumeTimer);
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
      width={size.w}
      height={size.h}
      // Opaque void so the canvas itself fills the viewport (the renderer clears to
      // theme.bg); the parent also paints theme.bg, so a resize never flashes a gap.
      backgroundColor={theme.bg}
      // Click-to-select prioritizes markers: only points and the globe sphere take
      // pointer events, so arcs/borders drawn over a marker never intercept the click
      // (the hover raycast skips them and lands on the point behind). Clicking the bare
      // globe clears the selection.
      pointerEventsFilter={(obj: { __globeObjType?: string }) =>
        obj?.__globeObjType === 'point' || obj?.__globeObjType === 'globe'}
      onGlobeClick={() => onSelect(null)}
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
      // Migration arcs child -> parent, graded by generation depth + weight.
      arcsData={arcs}
      arcStartLat="startLat"
      arcStartLng="startLng"
      arcEndLat="endLat"
      arcEndLng="endLng"
      arcColor={arcEndpointColors}
      // Long migrations are drawn a touch bolder so they read as the hero connections.
      arcStroke={(d: ArcDatum) => (d.longHaul ? 0.55 : 0.35)}
      arcDashLength={0.4}
      arcDashGap={0.1}
      arcDashAnimateTime={4500}
      // TODO(craft): hexBin density heatmap layer keyed on weight, toggled in the HUD.
    />
  );
}
