import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import type { ViewBox, ViewManifest, FastenerPoint, FastenerStatus } from '../types';
import { worldToViewBox, zoomViewBox, clampViewBox } from '../utils/coordinate';

const STATUS_COLOUR: Record<FastenerStatus, string> = {
  ok: '#22c55e',
  fail: '#ef4444',
  pending: '#f59e0b',
};

interface BuildViewerProps {
  panelId: string;
  /** Directory under /public/panels/ used to load SVG + manifest. Defaults to panelId. */
  assetId?: string;
  fasteners: FastenerPoint[];
  selected: FastenerPoint | null;
  onSelect: (point: FastenerPoint | null) => void;
}

interface DotData {
  fastId: string;
  svgX: number;
  svgY: number;
  status: FastenerStatus;
  point: FastenerPoint;
}

export default function BuildViewer({ panelId, assetId, fasteners, selected, onSelect }: BuildViewerProps) {
  const loadId = assetId ?? panelId;
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ViewManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wrapperRef    = useRef<HTMLDivElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const viewBoxRef    = useRef<ViewBox | null>(null);
  const manifestRef   = useRef<ViewManifest | null>(null);
  // Refs used inside event handlers and canvas draw — avoid stale closures
  const dotsRef       = useRef<DotData[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const dragStart     = useRef<{ x: number; y: number; vb: ViewBox } | null>(null);
  const hasDragged    = useRef(false);

  // ─── Canvas drawing ───────────────────────────────────────────────────────

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const vb = viewBoxRef.current;
    if (!canvas || !vb) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    // Coordinate transform: SVG units → physical canvas pixels
    const sx = cw / vb.w;
    const sy = ch / vb.h;

    ctx.clearRect(0, 0, cw, ch);

    const selId = selectedIdRef.current;

    for (const dot of dotsRef.current) {
      const px = (dot.svgX - vb.x) * sx;
      const py = (dot.svgY - vb.y) * sy;

      // Viewport cull — skip dots that are off-canvas
      if (px < -20 || px > cw + 20 || py < -20 || py > ch + 20) continue;

      // Dot radius: scales with zoom, capped so it never looks silly
      const r = Math.max(2 * dpr, Math.min(10 * sx, 16 * dpr));

      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = STATUS_COLOUR[dot.status];
      ctx.fill();

      if (dot.fastId === selId) {
        ctx.beginPath();
        ctx.arc(px, py, 48 * sx, 0, Math.PI * 2);
        ctx.strokeStyle = STATUS_COLOUR[dot.status];
        ctx.lineWidth = 3 * sx;
        ctx.stroke();
      }
    }
  }, []);

  // Set canvas physical pixel dimensions to match its CSS size × DPR, then redraw
  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(width  * dpr);
    canvas.height = Math.round(height * dpr);
    redrawCanvas();
  }, [redrawCanvas]);

  // ─── Apply viewBox imperatively — zero React re-renders ──────────────────

  const applyViewBox = useCallback((vb: ViewBox) => {
    viewBoxRef.current = vb;
    const s = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;
    wrapperRef.current?.querySelector('svg')?.setAttribute('viewBox', s);
    redrawCanvas();  // canvas redraws with new coordinate transform
  }, [redrawCanvas]);

  // ─── Data / manifest loading ──────────────────────────────────────────────

  useEffect(() => {
    setSvgMarkup(null);
    setManifest(null);
    setError(null);
    viewBoxRef.current = null;
    manifestRef.current = null;

    Promise.all([
      fetch(`/panels/${loadId}/panel.svg`).then((r) => {
        if (!r.ok) throw new Error(`SVG fetch failed: ${r.status}`);
        return r.text();
      }),
      fetch(`/panels/${loadId}/manifest.json`).then((r) => {
        if (!r.ok) throw new Error(`Manifest fetch failed: ${r.status}`);
        return r.json() as Promise<ViewManifest>;
      }),
    ])
      .then(([svg, mf]) => {
        viewBoxRef.current = mf.viewBox;  // set before render so layout effects can use it
        manifestRef.current = mf;
        setSvgMarkup(svg);
        setManifest(mf);
      })
      .catch((err: unknown) => setError((err as Error).message));
  }, [loadId]);

  // Inject base panel SVG markup imperatively
  useLayoutEffect(() => {
    if (!wrapperRef.current || !svgMarkup) return;
    wrapperRef.current.innerHTML = svgMarkup;
  }, [svgMarkup]);

  // Size + initial viewBox for the injected SVG
  useLayoutEffect(() => {
    if (!wrapperRef.current || !svgMarkup) return;
    const el = wrapperRef.current.querySelector('svg');
    if (!el) return;
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.display = 'block';
    el.style.overflow = 'hidden';
    const vb = viewBoxRef.current;
    if (vb) el.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  }, [svgMarkup]);

  // ─── Dot positions (recalculate only when fasteners list or manifest changes) ─

  const dots = useMemo<DotData[]>(() => {
    if (!manifest) return [];
    return fasteners.map((f) => {
      const { svgX, svgY } = worldToViewBox(f.worldX, f.worldY, manifest);
      return { fastId: f.fastId, svgX, svgY, status: f.status, point: f };
    });
  }, [fasteners, manifest]);

  // Initialise canvas once manifest is available; keep it sized with ResizeObserver
  useEffect(() => {
    if (!manifest) return;
    syncCanvasSize();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(syncCanvasSize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [manifest, syncCanvasSize]);

  // Sync dotsRef and redraw when the fastener list changes
  useEffect(() => {
    dotsRef.current = dots;
    redrawCanvas();
  }, [dots, redrawCanvas]);

  // Sync selectedIdRef and redraw when selection changes
  useEffect(() => {
    selectedIdRef.current = selected?.fastId ?? null;
    redrawCanvas();
  }, [selected, redrawCanvas]);

  // ─── Wheel zoom (non-passive to allow preventDefault) ────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !manifest) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const vb = viewBoxRef.current;
      const mf = manifestRef.current;
      if (!vb || !mf) return;
      const rect = el.getBoundingClientRect();
      const focalX = vb.x + ((e.clientX - rect.left) / rect.width) * vb.w;
      const focalY = vb.y + ((e.clientY - rect.top) / rect.height) * vb.h;
      const zoomed = zoomViewBox(vb, { x: focalX, y: focalY }, e.deltaY > 0 ? 1.1 : 0.9);
      if (zoomed.w < mf.viewBox.w * 0.05) return;
      applyViewBox(clampViewBox(zoomed, mf.viewBox));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [manifest, applyViewBox]);

  // ─── Pointer / pan / click ────────────────────────────────────────────────

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!viewBoxRef.current) return;
    hasDragged.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY, vb: viewBoxRef.current };
    e.currentTarget.style.cursor = 'grabbing';
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current || !containerRef.current || !manifestRef.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (!hasDragged.current && Math.hypot(dx, dy) > 4) hasDragged.current = true;
    if (!hasDragged.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const { vb } = dragStart.current;
    applyViewBox(clampViewBox(
      { ...vb, x: vb.x - dx * (vb.w / rect.width), y: vb.y - dy * (vb.h / rect.height) },
      manifestRef.current.viewBox,
    ));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const wasDrag = hasDragged.current;
    dragStart.current = null;
    hasDragged.current = false;
    e.currentTarget.style.cursor = 'grab';

    if (!wasDrag) {
      // It was a click — hit-test against dots
      const vb = viewBoxRef.current;
      const container = containerRef.current;
      if (!vb || !container) return;
      const rect = container.getBoundingClientRect();
      const svgX = vb.x + ((e.clientX - rect.left) / rect.width) * vb.w;
      const svgY = vb.y + ((e.clientY - rect.top) / rect.height) * vb.h;

      // Adaptive hit radius: at least 8px on screen, expressed in SVG units
      const hitRadius = Math.max(10, 8 / (rect.width / vb.w));

      let closest: DotData | null = null;
      let minDist = hitRadius;
      for (const dot of dotsRef.current) {
        const d = Math.hypot(dot.svgX - svgX, dot.svgY - svgY);
        if (d < minDist) { minDist = d; closest = dot; }
      }

      onSelect(closest
        ? (selectedIdRef.current === closest.fastId ? null : closest.point)
        : null,
      );
    }
  };

  const onPointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStart.current = null;
    hasDragged.current = false;
    e.currentTarget.style.cursor = 'grab';
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: '#dc2626' }}>
        Error: {error}
      </div>
    );
  }

  if (!svgMarkup || !manifest) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: '#6b7280' }}>
        Loading panel...
      </div>
    );
  }

  const aspectPct = `${(manifest.viewBox.h / manifest.viewBox.w) * 100}%`;

  return (
    <>
      <div style={{ marginBottom: '0.5rem' }}>
        <button onClick={() => applyViewBox(manifest.viewBox)}>Reset view</button>
      </div>
      <div
        ref={containerRef}
        style={{ position: 'relative', width: '100%', paddingBottom: aspectPct, cursor: 'grab', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      >
        {/* Base panel SVG — innerHTML managed imperatively, never re-rendered by React */}
        <div
          ref={wrapperRef}
          style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
        />
        {/* Canvas overlay — 7k+ dots drawn in a single batched paint, no SVG element overhead */}
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        />
      </div>
    </>
  );
}
