import { useState, useEffect } from 'react';
import type { FastenerPoint } from './types';
import { useFastenerFeed } from './hooks/useFastenerFeed';
import BuildViewer from './components/BuildViewer';
import DetailPanel from './components/DetailPanel';
import Navbar from './components/Navbar';
import ProcessProgress from './components/ProcessProgress';
import { PANELS, CURRENT_PANEL_ID, MACHINE_NAME } from './data/panelRegistry';
import {
  computeIdealTimestamps,
  generateActualTimestamps,
  generateFasteners,
} from './utils/processData';
import rawCoords from './data/fastenerCoords.txt?raw';

// ─── Module-level data (computed once at startup) ─────────────────────────

interface BaseCoord {
  fastId: string;
  worldX: number;
  worldY: number;
}

function parseBaseCoords(raw: string): BaseCoord[] {
  return raw
    .trim()
    .split('\n')
    .slice(1)          // skip header row
    .filter(Boolean)
    .map((line) => {
      const [fastId, x, y] = line.split('\t');
      return { fastId: fastId.trim(), worldX: parseFloat(x), worldY: parseFloat(y) };
    });
}

const BASE_COORDS = parseBaseCoords(rawCoords);
const IDEAL_TIMESTAMPS = computeIdealTimestamps(BASE_COORDS);

interface PanelData {
  fasteners: FastenerPoint[];
  actualTimestamps: number[];
}

const PANEL_DATA: Record<string, PanelData> = Object.fromEntries(
  PANELS.map((p) => [
    p.panelId,
    {
      fasteners: generateFasteners(BASE_COORDS, p.seed),
      actualTimestamps: generateActualTimestamps(
        IDEAL_TIMESTAMPS,
        p.delayFraction,
        p.numDelayed,
        p.seed + 1000,
      ),
    },
  ]),
);

// ─── Speed label helper ───────────────────────────────────────────────────

function speedLabel(ms: number): string {
  if (ms <= 600)  return 'Fast';
  if (ms <= 1400) return 'Normal';
  return 'Slow';
}

// ─── App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [activePanelId, setActivePanelId] = useState(CURRENT_PANEL_ID);
  const [selected, setSelected] = useState<FastenerPoint | null>(null);

  const activePanel   = PANELS.find((p) => p.panelId === activePanelId)!;
  const processData   = PANEL_DATA[activePanelId];

  // Feed is always tied to the live panel's fastener list
  const feed = useFastenerFeed(PANEL_DATA[CURRENT_PANEL_ID].fasteners);

  // On panel change: clear selection and reset feed
  const handlePanelSelect = (id: string) => {
    setActivePanelId(id);
    setSelected(null);
    feed.reset();
  };

  // Also reset feed when the active panel changes via the RUN button
  useEffect(() => {
    setSelected(null);
  }, [activePanelId]);

  const displayFasteners = activePanel.isLegacy ? processData.fasteners : feed.revealed;
  const revealedCount    = activePanel.isLegacy ? processData.fasteners.length : feed.revealed.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: 'monospace' }}>
      <Navbar
        machineName={MACHINE_NAME}
        panels={PANELS}
        activePanelId={activePanelId}
        onPanelSelect={handlePanelSelect}
        onRunClick={() => handlePanelSelect(CURRENT_PANEL_ID)}
      />

      <div style={{ padding: '0.5rem 0.75rem', flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* Panel title */}
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: 'var(--text-h)' }}>
          {activePanel.displayName}
        </h2>

        {/* Feed controls — live panel only */}
        {!activePanel.isLegacy && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            marginBottom: '0.5rem',
            flexWrap: 'wrap',
            fontSize: '0.85rem',
          }}>
            <button
              onClick={feed.isRunning ? feed.pause : feed.start}
              disabled={!feed.isRunning && feed.isComplete}
            >
              {feed.isRunning ? 'Pause' : 'Start'}
            </button>
            <button onClick={feed.reset} disabled={feed.revealed.length === 0 && !feed.isRunning}>
              Reset
            </button>
            <button onClick={feed.completeAll} disabled={feed.isComplete}>
              Complete All
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              Speed:
              <input
                type="range"
                min={5}
                max={3005}
                step={100}
                value={feed.speed}
                onChange={(e) => feed.setSpeed(Number(e.target.value))}
              />
              {speedLabel(feed.speed)}
            </label>
            <span style={{ color: 'var(--text)' }}>
              {feed.revealed.length.toLocaleString()} / {PANEL_DATA[CURRENT_PANEL_ID].fasteners.length.toLocaleString()}
            </span>
          </div>
        )}

        {/* BuildViewer */}
        <BuildViewer
          panelId={activePanel.panelId}
          assetId={activePanel.assetId}
          fasteners={displayFasteners}
          selected={selected}
          onSelect={setSelected}
        />

        {/* Bottom area: ProcessProgress or DetailPanel */}
        <div style={{ height: '800px', marginTop: '0.5rem', overflow: 'hidden' }}>
          {selected ? (
            <DetailPanel point={selected} onClose={() => setSelected(null)} />
          ) : (
            <ProcessProgress
              idealTimestamps={IDEAL_TIMESTAMPS}
              actualTimestamps={processData.actualTimestamps}
              revealedCount={revealedCount}
              legacy={activePanel.isLegacy}
            />
          )}
        </div>

      </div>
    </div>
  );
}
