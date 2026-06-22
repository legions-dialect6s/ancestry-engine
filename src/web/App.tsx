import { useEffect, useMemo, useState } from 'react';
import { analyze, type AnalysisResult } from '../analyze';
import sampleGed from '../demo/sample.ged?raw';
import { buildLayers } from './globeData';
import { GlobeView } from './GlobeView';
import { Hud } from './Hud';
import { theme } from './theme';

export function App() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [maxDepth, setMaxDepth] = useState(8);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analyze(sampleGed).then(setResult).catch((e) => setError(String(e)));
  }, []);

  const layers = useMemo(
    () => (result ? buildLayers(result.ancestors, result.links, maxDepth) : null),
    [result, maxDepth],
  );

  const selected = result?.ancestors.find((a) => a.id === selectedId) ?? null;

  const loadText = (text: string) => {
    setSelectedId(null);
    analyze(text).then(setResult).catch((e) => setError(String(e)));
  };

  if (error) return <Center>UNABLE TO PARSE TREE — {error}</Center>;
  if (!result || !layers) return <Center>RESOLVING PEDIGREE…</Center>;

  return (
    <div style={{ position: 'fixed', inset: 0, background: theme.bg, overflow: 'hidden' }}>
      <GlobeView points={layers.points} arcs={layers.arcs} onSelect={setSelectedId} />
      <Hud report={result.report} selected={selected} maxDepth={maxDepth} onMaxDepth={setMaxDepth} onUpload={loadText} />
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
