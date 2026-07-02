// Hand-built three.js craft for the geoscape globe — a custom dark globe material,
// a graticule, a Fresnel atmosphere shell, and full-scene bloom. Everything here is
// pure (takes a globe handle / params, returns disposable objects) so GlobeView stays
// declarative. All color is derived from `theme` — no new hues are invented here.

import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { theme } from './theme';

// react-globe.gl forwards these globe.gl methods through the component ref.
export interface GlobeHandle {
  getGlobeRadius: () => number;
  getCoords: (lat: number, lng: number, altitude?: number) => { x: number; y: number; z: number };
  postProcessingComposer: () => { addPass: (pass: unknown) => void } | undefined;
}

// --- Custom dark globe material -------------------------------------------------
// A matte dark sphere instead of a bitmap: a faint pole-to-equator gradient between
// the void and panel-edge tones, with a cyan Fresnel limb that the bloom pass lifts
// into a glowing rim. No texture, no external asset.
const GLOBE_VERT = /* glsl */ `
  varying vec3 vViewNormal;
  varying vec3 vViewDir;
  varying vec3 vObjNormal;
  void main() {
    vObjNormal = normalize(normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const GLOBE_FRAG = /* glsl */ `
  uniform vec3 colorLow;   // void / facing
  uniform vec3 colorHigh;  // panel-edge / poles
  uniform vec3 rimColor;   // cyan limb
  varying vec3 vViewNormal;
  varying vec3 vViewDir;
  varying vec3 vObjNormal;
  void main() {
    // Subtle latitude shading so the unlit sphere still reads as a sphere.
    float lat = clamp(abs(vObjNormal.y), 0.0, 1.0);
    vec3 base = mix(colorLow, colorHigh, 0.35 + 0.45 * lat);
    // Fresnel rim toward the silhouette.
    float fres = pow(1.0 - max(dot(vViewNormal, vViewDir), 0.0), 3.5);
    vec3 col = mix(base, rimColor, fres * 0.45);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function makeGlobeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      colorLow: { value: new THREE.Color(theme.bg) },
      colorHigh: { value: new THREE.Color(theme.panelEdge) },
      rimColor: { value: new THREE.Color(theme.accentCyan) },
    },
    vertexShader: GLOBE_VERT,
    fragmentShader: GLOBE_FRAG,
  });
}

// --- Fresnel atmosphere ---------------------------------------------------------
// A back-side sphere shell just outside the globe; intensity ramps toward the limb
// (classic Fresnel), additively blended so it only ever adds cyan light.
const ATMO_VERT = /* glsl */ `
  varying vec3 vViewNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const ATMO_FRAG = /* glsl */ `
  uniform vec3 glowColor;
  uniform float power;
  varying vec3 vViewNormal;
  varying vec3 vViewDir;
  void main() {
    // Back-side shell: dot ~ -1 facing the camera, ~0 at the limb. So (1+dot) ramps
    // from 0 at centre to 1 at the silhouette — a thin halo, scaled down so the
    // additive blend stays a glow rather than a fill.
    float intensity = pow(clamp(1.0 + dot(vViewNormal, vViewDir), 0.0, 1.0), power);
    gl_FragColor = vec4(glowColor, 1.0) * intensity * 0.55;
  }
`;

export function makeAtmosphere(globeRadius: number): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(globeRadius * 1.12, 64, 64);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(theme.accentCyan) },
      power: { value: 4.5 },
    },
    vertexShader: ATMO_VERT,
    fragmentShader: ATMO_FRAG,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Mesh(geometry, material);
}

// --- Graticule ------------------------------------------------------------------
// Lat/lng grid built with the globe's own getCoords so it stays locked to the same
// frame as the ancestor markers. Dim cyan lines that the bloom catches faintly.
export function makeGraticule(globe: GlobeHandle): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(theme.accentCyan),
    transparent: true,
    opacity: 0.16,
  });
  const alt = 0.004; // hover just above the surface so lines are not z-fought away

  const ringTo = (lat: number, lng: number) => {
    const c = globe.getCoords(lat, lng, alt);
    return new THREE.Vector3(c.x, c.y, c.z);
  };

  // Meridians every 15° of longitude.
  for (let lng = -180; lng < 180; lng += 15) {
    const pts: THREE.Vector3[] = [];
    for (let lat = -90; lat <= 90; lat += 3) pts.push(ringTo(lat, lng));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), material));
  }
  // Parallels every 15° of latitude (skip the poles).
  for (let lat = -75; lat <= 75; lat += 15) {
    const pts: THREE.Vector3[] = [];
    for (let lng = -180; lng <= 180; lng += 3) pts.push(ringTo(lat, lng));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), material));
  }
  return group;
}

/** Set the graticule's line opacity (all lines share one material). Fully faded also
 *  flips `visible` off so the ~36 line draw calls are skipped entirely up close. */
export function setGraticuleOpacity(graticule: THREE.Group, opacity: number): void {
  graticule.visible = opacity > 0.002;
  const line = graticule.children[0] as THREE.Line | undefined;
  const mat = line?.material as THREE.LineBasicMaterial | undefined;
  if (mat) mat.opacity = opacity;
}

// --- Bloom ----------------------------------------------------------------------
// Full-scene UnrealBloomPass on globe.gl's own post-processing composer. Threshold
// near zero so the dark scene's bright bits (limb, markers, arcs) glow.
export function attachBloom(globe: GlobeHandle, width: number, height: number): UnrealBloomPass | null {
  const composer = globe.postProcessingComposer();
  if (!composer) return null;
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.38, 0.42, 0.2);
  composer.addPass(bloom);
  return bloom;
}

// Dispose a three object tree (geometry + material) we added to the scene.
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh | THREE.Line;
    const geom = (mesh as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    geom?.dispose();
    const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}
