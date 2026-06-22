import { useEffect, useMemo, useState } from 'react';
import { analyze, type AnalysisResult } from '../analyze';
import sampleGed from '../demo/sample.ged?raw';
import { buildLayers } from './globeData';
import { GlobeView } from './GlobeView';
import { Hud } from './Hud';
import { theme } from './theme';

// Build the pedigree well past 8 generations so deep real trees are fully explorable;
// the look-back slider then ranges over whatever depth the loaded tree actually has.
// Real exports terminate most lines in gaps within a few generations, so the deeper
// cap stays cheap in practice.
const GEN_CAP = 20;

// Dragging the slider rebuilds every globe layer; debounce the heavy recompute so a
// drag doesn't thrash — the thumb/label stay live, layers settle when you stop.
const SLIDER_DEBOUNCE_MS = 110;

/** Look-back slider ceiling: the deepest generation present in the tree, floored at 8
 *  so the control stays usable on shallow trees (the sample only reaches gen 3). */
function sliderMaxGen(r: AnalysisResult): number {
  const depths = [...r.ancestors.flatMap((a) => a.depths), ...r.gaps.map((g) => g.depth)];
  return Math.max(8, 0, ...depths);
}

export function App() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [maxDepth, setMaxDepth] = useState(8); // live slider value (label + thumb)
  const [renderDepth, setRenderDepth] = useState(8); // debounced -> drives layer rebuild
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Isolate filter: a Set of region keys (modern countries) chosen from composition
  // rows. Empty = no filter. anchor is the last plain-clicked row, for shift-range.
  // A Set (not a single value) so a future "group" row can expand to many keys.
  const [regions, setRegions] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onRegionsChange = (next: Set<string>, a: string | null) => { setRegions(next); setAnchor(a); };
  const clearAll = () => { setSelectedId(null); setRegions(new Set()); setAnchor(null); };

  useEffect(() => {
    analyze(sampleGed, { maxGenerations: GEN_CAP }).then(setResult).catch((e) => setError(String(e)));
  }, []);

  const genMax = useMemo(() => (result ? sliderMaxGen(result) : 8), [result]);

  // Each freshly loaded tree starts by showing all generations, with no isolate filter.
  useEffect(() => {
    if (!result) return;
    const all = sliderMaxGen(result);
    setMaxDepth(all);
    setRenderDepth(all);
    setRegions(new Set());
    setAnchor(null);
  }, [result]);

  // Debounce: rebuild layers only once the slider value settles.
  useEffect(() => {
    const t = setTimeout(() => setRenderDepth(maxDepth), SLIDER_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [maxDepth]);

  // Esc clears the selected-ancestor card AND any isolate filter (empty-space click
  // on the globe does the same via GlobeView's onClear).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelectedId(null); setRegions(new Set()); setAnchor(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const layers = useMemo(
    () => (result ? buildLayers(result.ancestors, result.links, renderDepth) : null),
    [result, renderDepth],
  );

  const selected = result?.ancestors.find((a) => a.id === selectedId) ?? null;

  const loadText = (text: string) => {
    setSelectedId(null);
    analyze(text, { maxGenerations: GEN_CAP }).then(setResult).catch((e) => setError(String(e)));
  };

  if (error) return <Center>UNABLE TO PARSE TREE — {error}</Center>;
  if (!result || !layers) return <Center>RESOLVING PEDIGREE…</Center>;

  return (
    <div style={{ position: 'fixed', inset: 0, background: theme.bg, overflow: 'hidden' }}>
      <GlobeView
        points={layers.points}
        arcs={layers.arcs}
        selectedRegions={regions}
        onSelect={setSelectedId}
        onClear={clearAll}
      />
      <Hud
        report={result.report}
        selected={selected}
        maxDepth={maxDepth}
        maxGen={genMax}
        onMaxDepth={setMaxDepth}
        onUpload={loadText}
        selectedRegions={regions}
        regionAnchor={anchor}
        onRegionsChange={onRegionsChange}
      />
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: theme.bg, color: theme.textDim,
      display: 'grid', placeItems: 'center', fontFamily: theme.fontLabel,
      letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: 14,
    }}>
      {children}
    </div>
  );
}
