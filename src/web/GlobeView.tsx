import { useRef, useEffect, useMemo, useState, useCallback, type ComponentType } from 'react';
import Globe from 'react-globe.gl';
import { theme, withAlpha, mix } from './theme';
import type { PointDatum, ArcDatum } from './globeData';
import { WORLD_COUNTRIES } from './worldData';
import {
  makeGlobeMaterial,
  makeAtmosphere,
  makeGraticule,
  setGraticuleOpacity,
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
  /** Isolate filter: region keys whose ancestors stay lit. Empty = no filter. */
  selectedRegions: Set<string>;
  /** A marker id selects (only when no filter is active). */
  onSelect: (id: string | null) => void;
  /** Empty-space click on the globe — clears selection + filter. */
  onClear: () => void;
}

// Isolate filter: excluded markers keep their zoom brightness multiplied by this, so
// they dim (not vanish) for context while the selection stays lit. Excluded ARCS are
// removed entirely (see includedArcs) — "lines not in the category disappear".
const FILTER_DIM_MARKER = 0.16;

// --- Camera-altitude response ---------------------------------------------------
// Zoomed OUT (>= ALT_FAR): markers full size + bright, bloom full, arcs full — the
// striking wide sweep. Zoomed IN (<= ALT_NEAR): markers shrink + dim so a dense
// cluster resolves into distinguishable dots (visible, not hidden), bloom drops so
// the close-up isn't a white blowout, and arcs fade out then vanish so local detail
// is just dots. The altitude signal comes from globe.gl's onZoom callback.
const ALT_FAR = 2.2; // initial / fully zoomed-out view
const ALT_NEAR = 0.6; // fully zoomed-in
// Marker radius shrinks CONTINUOUSLY with altitude (radius is in angular degrees, so
// a fixed radius grows on screen as the camera closes in — scaling by alt/ALT_FAR
// keeps the on-screen dot size roughly constant instead of ballooning). The floor
// keeps deep-zoom dots clickable.
const MARKER_MIN_SCALE = 0.14;
const MARKER_FAR_BRIGHT = 1.0;
const MARKER_NEAR_BRIGHT = 0.75;
// Marker pillar height also flattens on zoom ("lines" bug, part 3): a high-weight
// leaf's pillar is up to ~0.6 globe radii tall, and viewed obliquely up close a tall
// thin pillar reads as a line, not a dot. Quadratic in altitude so the flattening
// arrives fast once you leave the overview; the floor keeps dots raycastable.
const PILLAR_MIN_SCALE = 0.02;
const BLOOM_FAR = 0.38; // matches attachBloom's initial strength
const BLOOM_NEAR = 0.1;
// Arcs are the migration story — the lines connecting the nodes — so they stay at
// full strength from the default framing down through moderate inspection zoom, then
// fade and clear out only at true close-in, where street-level detail should be just
// dots. (The old band was full at 2.2 / gone below 2.0: a razor-thin sliver at max
// zoom-out, so arcs vanished on the first scroll click.)
const ALT_ARC_HIDE = 0.45; // arcs hidden entirely below this altitude (true close-in)
const ARC_FULL_ALT = 1.2; // arcs full at/above this; fade between the two
// Auto-rotation switches off once you've zoomed in past this (gentler than arc-hide).
const ALT_NO_ROTATE = 1.3;
// The graticule is overview texture, like the arcs: its long great-circle sweeps read
// as "lines" up close. Fade it over the wide->inspect band; gone by ALT_NO_ROTATE.
const GRAT_OPACITY_FAR = 0.16; // matches makeGraticule's authored opacity
// Country borders stay as faint context up close (you still want England's outline
// when inspecting England) but drop from their wide-view brightness so they stop
// reading as glowing lines once you're in.
const BORDER_STROKE_FAR = 0.55;
const BORDER_STROKE_NEAR = 0.18;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 1 when zoomed out (far), 0 when zoomed in (near). */
const zoomT = (alt: number) => clamp01((alt - ALT_NEAR) / (ALT_FAR - ALT_NEAR));
const bloomStrengthFor = (alt: number) => lerp(BLOOM_NEAR, BLOOM_FAR, zoomT(alt));
const markerScale = (alt: number) => Math.min(1, Math.max(MARKER_MIN_SCALE, alt / ALT_FAR));
const markerBright = (alt: number) => lerp(MARKER_NEAR_BRIGHT, MARKER_FAR_BRIGHT, zoomT(alt));
const pillarScale = (alt: number) => {
  const t = Math.min(1, alt / ALT_FAR); // continuous below ALT_NEAR, unlike zoomT
  return Math.max(PILLAR_MIN_SCALE, t * t);
};
/** 1 when arcs are full, ramps to 0 by ALT_ARC_HIDE (below which arcs are hidden). */
const arcAltFactor = (alt: number) => clamp01((alt - ALT_ARC_HIDE) / (ARC_FULL_ALT - ALT_ARC_HIDE));
const graticuleOpacityFor = (alt: number) =>
  GRAT_OPACITY_FAR * clamp01((alt - ALT_NO_ROTATE) / (ALT_FAR - ALT_NO_ROTATE));
const borderStrokeFor = (alt: number) => lerp(BORDER_STROKE_NEAR, BORDER_STROKE_FAR, zoomT(alt));

const ZOOM_THROTTLE_MS = 110; // marker/arc accessor refresh cadence during a zoom gesture
const NO_ARCS: ArcDatum[] = []; // stable empty reference for the close-in (arcs hidden) state

// --- Arc grading ----------------------------------------------------------------
// Long migrations glow warm amber — the hero "crossing" color — while shorter arcs
// grade by depth (recent warm -> deep cool), so the ocean sweeps pop warm against the
// cooler local web. Brightness is keyed to SALIENCE, not depth, so deep low-weight
// migrations stay bright; `altFactor` then fades the whole set as the camera zooms in.
const ARC_DEPTH_REF = 12;
const ARC_BRIGHT_WEIGHT = 0.2;
const ARC_LONGHAUL_OPACITY = 0.6;

function arcEndpointColors(d: ArcDatum, altFactor: number): [string, string] {
  const hue = d.longHaul
    ? theme.accentAmber
    : mix(theme.accentAmber, theme.accentCyan, Math.min(1, d.depth / ARC_DEPTH_REF));
  let opacity = 0.3 + 0.6 * Math.min(1, Math.sqrt(d.weight / ARC_BRIGHT_WEIGHT));
  if (d.longHaul) opacity = Math.max(opacity, ARC_LONGHAUL_OPACITY);
  opacity *= altFactor; // fade out as we zoom in
  return [withAlpha(hue, 0), withAlpha(hue, opacity)];
}

export function GlobeView({ points, arcs, selectedRegions, onSelect, onClear }: Props) {
  const ref = useRef<any>(null);
  const filterActive = selectedRegions.size > 0;

  // Custom dark globe material, memoized so it survives re-renders.
  const globeMaterial = useMemo(() => makeGlobeMaterial(), []);

  // Camera altitude drives marker size/brightness and arc visibility. Throttled so a
  // zoom gesture doesn't rebuild the point geometry every frame; bloom is mutated
  // directly (cheap) for a smooth response.
  const [viewAlt, setViewAlt] = useState(ALT_FAR);
  const altRef = useRef(ALT_FAR);
  const zoomThrottle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bloomRef = useRef<ReturnType<typeof attachBloom>>(null);
  const graticuleRef = useRef<ReturnType<typeof makeGraticule> | null>(null);

  // Auto-rotate master switch (toggled with R). rotateOnRef is read by the existing
  // interaction logic; rotateOn is just for the on-screen hint.
  const [rotateOn, setRotateOn] = useState(true);
  const rotateOnRef = useRef(true);

  // Bridge refs so the zoom callback and the isolate-filter effect can gate the
  // rotation logic without rewriting it: canAutoRotate() reads filter + altitude; the
  // effect publishes stop/armResume back out so external state changes can drive them.
  const filterActiveRef = useRef(false);
  const stopRotateRef = useRef<(() => void) | null>(null);
  const armResumeRef = useRef<(() => void) | null>(null);

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

  // Clean up the zoom throttle timer on unmount — and RESET the ref, not just clear
  // the timer. The mount effect's pointOfView() fires onZoom immediately, scheduling a
  // timer; StrictMode's simulated unmount then runs this cleanup between the double-
  // invoked effects. Clearing without resetting left the ref holding a dead timer id,
  // so the `=== undefined` guard in onZoom never scheduled again: viewAlt froze at the
  // initial altitude and arcs never hid on zoom (the zoomed-in "lines" bug, part 1).
  useEffect(() => () => {
    if (zoomThrottle.current !== undefined) {
      clearTimeout(zoomThrottle.current);
      zoomThrottle.current = undefined;
    }
  }, []);

  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const controls = g.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.enableDamping = true;
    g.pointOfView({ lat: 55, lng: 12, altitude: ALT_FAR }, 0);

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
    graticuleRef.current = graticule;
    setGraticuleOpacity(graticule, graticuleOpacityFor(altRef.current));

    const bloom = attachBloom(globe, window.innerWidth, window.innerHeight);
    bloomRef.current = bloom;

    // Ambient auto-rotate that yields to the user. The constant spin makes markers
    // impossible to hover/click, so any interaction (drag, wheel, pointerdown) or
    // simply hovering the globe pauses rotation; it resumes ~4s after the pointer
    // goes idle AND has left. The R master switch only GATES this — when off, it
    // never resumes; when on, the behavior below is exactly as before.
    const canvas: HTMLCanvasElement = g.renderer().domElement;
    const IDLE_MS = 4000;
    let hovering = false;
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;

    // Rotation is allowed only when the master is on, no isolate filter is active, and
    // the camera is zoomed out past the close-in altitude (and the pointer isn't on the
    // globe). The interaction logic below is otherwise unchanged — these are gates.
    const canAutoRotate = () =>
      rotateOnRef.current && !filterActiveRef.current && altRef.current >= ALT_NO_ROTATE && !hovering;

    const stop = () => {
      controls.autoRotate = false;
      if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = undefined; }
    };
    const armResume = () => {
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        resumeTimer = undefined;
        if (canAutoRotate()) controls.autoRotate = true;
      }, IDLE_MS);
    };
    stopRotateRef.current = stop;
    armResumeRef.current = armResume;
    const onMove = () => { hovering = true; stop(); };
    const onLeave = () => { hovering = false; armResume(); };

    // R toggles the master switch.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'r' && e.key !== 'R') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      rotateOnRef.current = !rotateOnRef.current;
      setRotateOn(rotateOnRef.current);
      if (!rotateOnRef.current) {
        controls.autoRotate = false;
        if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = undefined; }
      } else if (canAutoRotate()) {
        controls.autoRotate = true;
      }
    };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', stop);
    canvas.addEventListener('wheel', stop, { passive: true });
    controls.addEventListener('start', stop); // OrbitControls: drag/zoom begins
    controls.addEventListener('end', armResume); // drag/zoom ends -> idle countdown
    window.addEventListener('keydown', onKey);

    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', stop);
      canvas.removeEventListener('wheel', stop);
      controls.removeEventListener('start', stop);
      controls.removeEventListener('end', armResume);
      window.removeEventListener('keydown', onKey);
      if (resumeTimer) clearTimeout(resumeTimer);
      stopRotateRef.current = null;
      armResumeRef.current = null;
      graticuleRef.current = null;
      scene.remove(graticule);
      scene.remove(atmosphere);
      disposeObject(graticule);
      disposeObject(atmosphere);
      bloom?.dispose();
      bloomRef.current = null;
    };
  }, []);

  // Isolate filter gates rotation: selecting a category stops the spin; clearing it
  // lets rotation resume after the usual idle (subject to the other gates).
  useEffect(() => {
    filterActiveRef.current = filterActive;
    if (filterActive) stopRotateRef.current?.();
    else armResumeRef.current?.();
  }, [filterActive]);

  // Camera zoom -> bloom + graticule fade (smooth, direct three-object mutations, no
  // React re-render) + throttled marker/arc/border refresh through React state.
  const onZoom = (pov: { altitude: number }) => {
    altRef.current = pov.altitude;
    if (bloomRef.current) bloomRef.current.strength = bloomStrengthFor(pov.altitude);
    if (graticuleRef.current) setGraticuleOpacity(graticuleRef.current, graticuleOpacityFor(pov.altitude));
    if (zoomThrottle.current === undefined) {
      zoomThrottle.current = setTimeout(() => {
        zoomThrottle.current = undefined;
        setViewAlt(altRef.current);
      }, ZOOM_THROTTLE_MS);
    }
  };

  const arcFactor = arcAltFactor(viewAlt);
  const mScale = markerScale(viewAlt);
  const mBright = markerBright(viewAlt);
  const pScale = pillarScale(viewAlt);
  // Quantized so the polygon layer re-strokes ~8 times across the whole zoom range
  // instead of on every 110ms throttle tick.
  const borderAlpha = Math.round(borderStrokeFor(viewAlt) * 20) / 20;

  // While a filter is active, arcs not in the selection disappear entirely (only the
  // category's lines remain); zoom then hides whatever's left below ALT_ARC_HIDE.
  const includedArcs = useMemo(
    () => (filterActive ? arcs.filter((a) => a.region != null && selectedRegions.has(a.region)) : arcs),
    [arcs, selectedRegions, filterActive],
  );
  const visibleArcs = viewAlt < ALT_ARC_HIDE ? NO_ARCS : includedArcs;

  // Layer accessors, memoized on what they actually read. react-globe.gl re-applies a
  // layer whenever an accessor prop changes identity, so inline closures made EVERY
  // re-render (a selection click, the rotate hint, a resize) re-process points, arcs,
  // AND polygons. With these, a layer only re-processes when its inputs change.
  // Pillar height flattens with zoom, but the 0.003 floor keeps every dot ABOVE the
  // country-polygon layer (0.002) at all altitudes — a fully scaled pillar would sink
  // under the cap fill and be occluded. At pScale=1 this equals the original 0.02+w*0.6.
  const pointAltitudeFn = useCallback((d: PointDatum) => 0.003 + (0.017 + d.weight * 0.6) * pScale, [pScale]);
  const pointRadiusFn = useCallback((d: PointDatum) => (d.isLeaf ? 0.34 : 0.2) * mScale, [mScale]);
  const pointColorFn = useCallback((d: PointDatum) => {
    const included = !filterActive || (d.region != null && selectedRegions.has(d.region));
    const bright = mBright * (included ? 1 : FILTER_DIM_MARKER); // zoom × filter
    return mix(d.isLeaf ? theme.accentAmber : theme.accentCyan, theme.bg, 1 - bright);
  }, [mBright, filterActive, selectedRegions]);
  const pointLabelFn = useCallback((d: PointDatum) => d.label, []);
  const onPointClickFn = useCallback((d: PointDatum) => onSelect(d.id), [onSelect]);
  const arcColorFn = useCallback((d: ArcDatum) => arcEndpointColors(d, arcFactor), [arcFactor]);
  const arcStrokeFn = useCallback((d: ArcDatum) => (d.longHaul ? 0.55 : 0.35), []);
  const polygonCapColorFn = useCallback(() => withAlpha(theme.accentCyan, 0.05), []);
  const polygonSideColorFn = useCallback(() => withAlpha(theme.accentCyan, 0.08), []);
  const polygonStrokeColorFn = useMemo(() => {
    const c = withAlpha(theme.accentCyan, borderAlpha);
    return () => c;
  }, [borderAlpha]);
  const pointerEventsFilterFn = useMemo(() => (filterActive
    ? (obj: { __globeObjType?: string }) => obj?.__globeObjType === 'globe'
    : (obj: { __globeObjType?: string }) => obj?.__globeObjType === 'point' || obj?.__globeObjType === 'globe'),
  [filterActive]);

  return (
    <>
      <GlobeAny
        ref={ref}
        width={size.w}
        height={size.h}
        // Opaque void so the canvas itself fills the viewport (the renderer clears to
        // theme.bg); the parent also paints theme.bg, so a resize never flashes a gap.
        backgroundColor={theme.bg}
        onZoom={onZoom}
        // Click-to-select prioritizes markers: only points and the globe sphere take
        // pointer events, so arcs/borders drawn over a marker never intercept the click
        // (the hover raycast skips them and lands on the point behind). While an isolate
        // filter is active the globe is read-only — only the bare globe stays clickable,
        // to clear. Selection is managed from the composition rows.
        pointerEventsFilter={pointerEventsFilterFn}
        onGlobeClick={onClear}
        // Craft: no bitmap — a custom dark globe ShaderMaterial (see globeCraft.ts)
        // carries a cyan Fresnel limb; the graticule, Fresnel atmosphere shell, and
        // UnrealBloomPass are added to the scene/composer in the effect above.
        globeMaterial={globeMaterial}
        showAtmosphere={false}
        // Country-border base map (modern Natural Earth 110m; on-ramp to historical
        // basemaps). Hairline cyan borders over a near-invisible cyan fill, seated just
        // above the surface so it stays beneath the ancestor markers and arcs. Stroke
        // dims with zoom (the "lines" bug, part 2: borders at 0.55 read as glowing
        // arcs up close) — faint context near, full brightness at the wide view.
        // Seated 0.002 above the surface: high enough to avoid z-fighting the globe,
        // low enough that (a) the extruded side walls don't read as thick slabs at
        // close zoom and (b) fully flattened markers (floor 0.003) still clear the cap.
        polygonsData={WORLD_COUNTRIES}
        polygonAltitude={0.002}
        polygonCapColor={polygonCapColorFn}
        polygonSideColor={polygonSideColorFn}
        polygonStrokeColor={polygonStrokeColorFn}
        polygonsTransitionDuration={0}
        // Ancestors as markers: leaves (terminal known ancestors) in amber, interior in
        // cyan; altitude scales with contribution weight. Size + brightness scale with
        // camera altitude so a dense cluster resolves into distinct dots up close.
        pointsData={points}
        pointLat="lat"
        pointLng="lng"
        pointAltitude={pointAltitudeFn}
        pointRadius={pointRadiusFn}
        pointColor={pointColorFn}
        pointLabel={pointLabelFn}
        onPointClick={onPointClickFn}
        pointsTransitionDuration={250}
        // Migration arcs child -> parent, graded by depth + weight, faded with zoom and
        // hidden entirely up close (just dots). Excluded-category arcs are already
        // filtered out of visibleArcs, so color only handles the zoom fade.
        arcsData={visibleArcs}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcColor={arcColorFn}
        arcStroke={arcStrokeFn}
        arcDashLength={0.4}
        arcDashGap={0.1}
        arcDashAnimateTime={4500}
        arcsTransitionDuration={120}
        // TODO(craft): hexBin density heatmap layer keyed on weight, toggled in the HUD.
      />
      {/* Unobtrusive auto-rotate hint — reflects the EFFECTIVE state (the R master plus
          the automatic gates: off while zoomed in or isolating). */}
      <div style={{
        position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)',
        fontFamily: theme.fontData, fontSize: 10, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: theme.textDim, opacity: 0.5, pointerEvents: 'none',
      }}>
        ↻ auto-rotate {rotateOn && !filterActive && viewAlt >= ALT_NO_ROTATE ? 'on' : 'off'} · R
      </div>
    </>
  );
}
