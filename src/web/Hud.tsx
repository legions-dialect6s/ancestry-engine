import { useState, type CSSProperties, type ChangeEvent, type MouseEvent } from 'react';
import { theme, panelClip, withAlpha } from './theme';
import type { AncestryReport } from '../aggregate/AncestryReport';
import type { GlobeAncestor } from '../analyze';

/** Format a fractional share with enough precision that small real lines stay legible
 *  instead of collapsing to "0.0%" — extra decimals below 0.1%, a floor of "<0.01%". */
function fmtShare(x: number): string {
  const p = x * 100;
  if (p <= 0) return '0%';
  if (p < 0.01) return '<0.01%';
  if (p < 0.1) return `${p.toFixed(2)}%`;
  return `${p.toFixed(1)}%`;
}

// Collapsed composition shows this many lines; the rest expand inline on click.
const COMPOSITION_SHOWN = 20;

/** Round weights (summing to ~1) to tenths of a percent that sum to EXACTLY 100.0 —
 *  largest-remainder, so the coverage buckets never read "100.1%". Presentation only;
 *  the underlying weights are untouched. */
function toHundredPct(weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  const tenths = weights.map((w) => (w / total) * 1000);
  const floors = tenths.map(Math.floor);
  let left = 1000 - floors.reduce((s, f) => s + f, 0);
  const byFrac = tenths.map((t, i) => ({ i, frac: t - Math.floor(t) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; left > 0 && byFrac.length; k++, left--) floors[byFrac[k % byFrac.length]!.i]! += 1;
  return floors.map((f) => f / 10);
}

const panel: CSSProperties = {
  position: 'absolute',
  background: theme.panel,
  border: `1px solid ${theme.panelEdge}`,
  clipPath: panelClip,
  padding: '14px 16px',
  color: theme.text,
  fontFamily: theme.fontData,
  fontSize: 13,
  backdropFilter: 'blur(6px)',
  pointerEvents: 'auto',
};
const eyebrow: CSSProperties = {
  fontFamily: theme.fontLabel,
  textTransform: 'uppercase',
  letterSpacing: '0.22em',
  fontSize: 11,
  color: theme.textDim,
  marginBottom: 8,
};

interface Props {
  report: AncestryReport;
  selected: GlobeAncestor | null;
  maxDepth: number;
  maxGen: number;
  onMaxDepth: (d: number) => void;
  onUpload: (gedcomText: string) => void;
  /** Isolate filter: selected region keys. Empty = no filter. */
  selectedRegions: Set<string>;
  /** Last plain-clicked region (shift-range anchor). */
  regionAnchor: string | null;
  onRegionsChange: (next: Set<string>, anchor: string | null) => void;
}

export function Hud({
  report, selected, maxDepth, maxGen, onMaxDepth, onUpload,
  selectedRegions, regionAnchor, onRegionsChange,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const c = report.coverage;
  const unknown = c.unresolvedWeight + c.gapWeight;
  // Display the two coverage buckets so they read as exactly 100% together.
  const coveragePct = toHundredPct([c.resolvedWeight, unknown]);
  const resolvedPct = coveragePct[0] ?? 0;
  const unknownPct = coveragePct[1] ?? 0;

  const allShares = report.breakdown.fractional.modernCountry ?? [];
  const shares = expanded ? allShares : allShares.slice(0, COMPOSITION_SHOWN);
  const hidden = allShares.length - Math.min(allShares.length, COMPOSITION_SHOWN);
  const filterActive = selectedRegions.size > 0;

  // Selection model (Finder/Ableton), keyed off the full ordered row list so it's
  // consistent whether the panel is collapsed or expanded.
  const onRowClick = (region: string, e: MouseEvent) => {
    const ordered = allShares.map((s) => s.region);
    if (e.shiftKey && regionAnchor != null) {
      const i = ordered.indexOf(regionAnchor);
      const j = ordered.indexOf(region);
      if (i >= 0 && j >= 0) {
        const [lo, hi] = i <= j ? [i, j] : [j, i];
        const next = new Set<string>();
        for (let k = lo; k <= hi; k++) next.add(ordered[k]!);
        onRegionsChange(next, regionAnchor); // anchor stays the plain-clicked row
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(selectedRegions);
      if (next.has(region)) next.delete(region); else next.add(region);
      onRegionsChange(next, regionAnchor ?? region);
      return;
    }
    // Plain: select just this row; clicking the lone active selection again clears.
    if (selectedRegions.size === 1 && selectedRegions.has(region)) onRegionsChange(new Set(), null);
    else onRegionsChange(new Set([region]), region);
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) f.text().then(onUpload);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFamily: theme.fontData }}>
      {/* Title — top left */}
      <div style={{ ...panel, top: 18, left: 18, maxWidth: 280 }}>
        <div style={eyebrow}>Ancestry Engine</div>
        <div style={{ color: theme.text, fontFamily: theme.fontLabel, fontSize: 18, letterSpacing: '0.04em' }}>
          PEDIGREE GEOSCAPE
        </div>
        <div style={{ color: theme.textDim, fontSize: 11, marginTop: 4 }}>
          documented origins · not a DNA test
        </div>
      </div>

      {/* Ancestry readout — composition rows double as the isolate-filter control. */}
      <div style={{ ...panel, top: 18, right: 18, minWidth: 230, maxWidth: 280 }}>
        <div style={eyebrow}>
          Composition{filterActive ? ` · isolating ${selectedRegions.size} · esc to clear` : ''}
        </div>
        <div style={{ maxHeight: '42vh', overflowY: 'auto' }}>
          {shares.map((s) => {
            const sel = selectedRegions.has(s.region);
            return (
              <div
                key={s.region}
                onClick={(e) => onRowClick(s.region, e)}
                style={{
                  display: 'flex', justifyContent: 'space-between', gap: 12,
                  padding: '2px 4px', borderRadius: 2, cursor: 'pointer', userSelect: 'none',
                  color: sel ? theme.accentCyan : theme.text,
                  background: sel ? withAlpha(theme.accentCyan, 0.12) : 'transparent',
                  opacity: filterActive && !sel ? 0.5 : 1,
                }}
              >
                <span>{s.region}</span>
                <span style={{ textAlign: 'right' }}>{fmtShare(s.value)}</span>
              </div>
            );
          })}
          {hidden > 0 && (
            <div
              onClick={() => setExpanded((v) => !v)}
              style={{ color: theme.accentCyan, fontSize: 10, padding: '5px 4px', cursor: 'pointer', userSelect: 'none', opacity: 0.85 }}
            >
              {expanded ? '− show fewer' : `+${hidden} smaller lines — show all`}
            </div>
          )}
        </div>
        <div style={{ height: 1, background: theme.panelEdge, margin: '10px 0' }} />
        <Row label="resolved" value={`${resolvedPct.toFixed(1)}%`} dim />
        {/* Honest uncertainty, rendered as a first-class stat rather than hidden. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', color: theme.warn, fontSize: 15, marginTop: 4 }}>
          <span style={{ fontFamily: theme.fontLabel, letterSpacing: '0.12em' }}>UNKNOWN</span>
          <span>{unknownPct.toFixed(1)}%</span>
        </div>
      </div>

      {/* Selected ancestor — slides into bottom right */}
      {selected && (
        <div style={{ ...panel, bottom: 18, right: 18, maxWidth: 320 }}>
          <div style={eyebrow}>Selected · gen {selected.minDepth}</div>
          <div style={{ fontFamily: theme.fontLabel, fontSize: 16, color: theme.text }}>{selected.name}</div>
          <Row label="born" value={`${selected.birthPlace ?? '?'}${selected.birthYear ? ` (${selected.birthYear})` : ''}`} />
          <Row label="modern" value={selected.modernCountry ?? '—'} />
          <Row label="at birth" value={selected.historicalPolity ?? '—'} />
          <Row label="share" value={fmtShare(selected.contributionWeight)} />
          <div style={{ color: theme.textDim, fontSize: 10, marginTop: 8, wordBreak: 'break-word' }}>
            {selected.provenance}
          </div>
        </div>
      )}

      {/* Controls — bottom left */}
      <div style={{ ...panel, bottom: 18, left: 18, width: 280 }}>
        <div style={eyebrow}>Look back · {maxDepth} of {maxGen} generations</div>
        <input
          type="range" min={0} max={maxGen} value={maxDepth}
          onChange={(e) => onMaxDepth(Number(e.target.value))}
          style={{ width: '100%', accentColor: theme.accentCyan }}
        />
        <label style={{ ...eyebrow, marginTop: 12, display: 'block', cursor: 'pointer', color: theme.accentCyan }}>
          Load a GEDCOM (stays on device)
          <input type="file" accept=".ged" onChange={onFile} style={{ display: 'none' }} />
        </label>
      </div>
    </div>
  );
}

function Row({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0', color: dim ? theme.textDim : theme.text }}>
      <span style={{ color: theme.textDim }}>{label}</span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  );
}
