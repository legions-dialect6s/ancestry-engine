import { type CSSProperties, type ChangeEvent } from 'react';
import { theme, panelClip } from './theme';
import type { AncestryReport } from '../aggregate/AncestryReport';
import type { GlobeAncestor } from '../analyze';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

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
}

export function Hud({ report, selected, maxDepth, maxGen, onMaxDepth, onUpload }: Props) {
  const c = report.coverage;
  const unknown = c.unresolvedWeight + c.gapWeight;
  const shares = (report.breakdown.fractional.modernCountry ?? []).slice(0, 6);

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

      {/* Ancestry readout — the corner stat panel (the always-visible signature). */}
      <div style={{ ...panel, top: 18, right: 18, minWidth: 230 }}>
        <div style={eyebrow}>Composition</div>
        {shares.map((s) => (
          <Row key={s.region} label={s.region} value={pct(s.value)} />
        ))}
        <div style={{ height: 1, background: theme.panelEdge, margin: '10px 0' }} />
        <Row label="resolved" value={pct(c.resolvedWeight)} dim />
        {/* Honest uncertainty, rendered as a first-class stat rather than hidden. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', color: theme.warn, fontSize: 15, marginTop: 4 }}>
          <span style={{ fontFamily: theme.fontLabel, letterSpacing: '0.12em' }}>UNKNOWN</span>
          <span>{pct(unknown)}</span>
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
          <Row label="share" value={pct(selected.contributionWeight)} />
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
