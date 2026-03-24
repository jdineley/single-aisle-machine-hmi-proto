// Phase 2 — DXF to SVG pre-processor
// Usage: node scripts/dxf-to-svg.mjs <input.dxf> <output-dir>

import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, basename, extname, join } from 'path';

const require = createRequire(import.meta.url);
const DxfParser = require('dxf-parser');

// ── CLI args ─────────────────────────────────────────────────────────────────

const [,, inputArg, outputDirArg] = process.argv;

if (!inputArg || !outputDirArg) {
  console.error('Usage: node scripts/dxf-to-svg.mjs <input.dxf> <output-dir>');
  process.exit(1);
}

const inputPath  = resolve(inputArg);
const outputDir  = resolve(outputDirArg);

if (!existsSync(inputPath)) {
  console.error(`Error: input file not found: ${inputPath}`);
  process.exit(1);
}

// ── Parse ─────────────────────────────────────────────────────────────────────

let dxf;
try {
  const raw = readFileSync(inputPath, 'utf-8');
  const parser = new DxfParser();
  dxf = parser.parseSync(raw);
} catch (err) {
  console.error(`Error: dxf-parser failed: ${err.message}`);
  process.exit(1);
}

// ── Collect entities ──────────────────────────────────────────────────────────

const SUPPORTED = ['LINE', 'LWPOLYLINE', 'POLYLINE', 'ARC', 'CIRCLE', 'ELLIPSE', 'SPLINE'];
const allEntities = dxf.entities ?? [];
const counts = {};

for (const e of allEntities) {
  counts[e.type] = (counts[e.type] ?? 0) + 1;
}

const entities = allEntities.filter(e => SUPPORTED.includes(e.type));

if (entities.length === 0) {
  console.warn('Warning: no supported entities found — SVG will be empty.');
}

// ── Angle helpers ─────────────────────────────────────────────────────────────
// ARC  angles: dxf-parser returns DEGREES  (as stored in the DXF format).
// ELLIPSE angles: dxf-parser returns RADIANS (parametric, as stored in DXF).

const DEG = Math.PI / 180;

// Normalise an angle in degrees to [0, 360)
function normDeg(a) {
  return ((a % 360) + 360) % 360;
}

// CCW sweep from startDeg to endDeg, result in [0, 360]
function sweepDeg(start, end) {
  const s = normDeg(end - start);
  return s === 0 ? 360 : s;
}

// ── Ellipse geometry helpers ──────────────────────────────────────────────────
// DXF ELLIPSE: center + majorAxisEndPoint (vector from center, defines rx and
// the rotation angle) + axisRatio (ry = rx * axisRatio) + startAngle/endAngle
// in radians (parametric CCW from major axis).

function ellipseGeom(e) {
  const mx = e.majorAxisEndPoint?.x ?? 1;
  const my = e.majorAxisEndPoint?.y ?? 0;
  const rx = Math.sqrt(mx * mx + my * my);   // semi-major
  const ry = rx * (e.axisRatio ?? 1);        // semi-minor
  const rotRad = Math.atan2(my, mx);         // rotation of major axis
  const rotDeg = rotRad / DEG;
  return { rx, ry, rotRad, rotDeg };
}

// Point on ellipse at parametric angle theta (radians)
function ellipsePoint(e, geom, theta) {
  const { rx, ry, rotRad } = geom;
  return {
    x: e.center.x + Math.cos(theta) * rx * Math.cos(rotRad) - Math.sin(theta) * ry * Math.sin(rotRad),
    y: e.center.y + Math.cos(theta) * rx * Math.sin(rotRad) + Math.sin(theta) * ry * Math.cos(rotRad),
  };
}

// ── Compute bounds ────────────────────────────────────────────────────────────
// Per-type coordinate tracking for diagnostics.

const typeBounds = {};

function expandPoint(type, x, y) {
  if (!isFinite(x) || !isFinite(y)) return;
  if (!typeBounds[type]) typeBounds[type] = { minX: x, maxX: x, minY: y, maxY: y };
  const b = typeBounds[type];
  if (x < b.minX) b.minX = x;
  if (x > b.maxX) b.maxX = x;
  if (y < b.minY) b.minY = y;
  if (y > b.maxY) b.maxY = y;
}

// ARC and ELLIPSE from 3D-model projections can have enormous radii, placing
// their endpoints far outside the physical panel boundary. Exclude both from
// the viewBox calculation — the outline is fully defined by LINE/POLYLINE.
// They still render; anything outside the viewBox is clipped by overflow:hidden.
const BOUNDS_TYPES = new Set(['LINE', 'LWPOLYLINE', 'POLYLINE', 'CIRCLE', 'SPLINE']);

for (const e of entities) {
  switch (e.type) {
    case 'LINE': {
      // dxf-parser may use `vertices` or `start`/`end` depending on file/version.
      const v0 = e.vertices?.[0] ?? e.start;
      const v1 = e.vertices?.[1] ?? e.end;
      if (v0) expandPoint('LINE', v0.x, v0.y);
      if (v1) expandPoint('LINE', v1.x, v1.y);
      break;
    }

    case 'LWPOLYLINE':
      for (const v of (e.vertices ?? [])) expandPoint('LWPOLYLINE', v.x, v.y);
      break;

    case 'POLYLINE':
      for (const v of (e.vertices ?? [])) {
        expandPoint('POLYLINE', v.position?.x ?? v.x, v.position?.y ?? v.y);
      }
      break;

    case 'CIRCLE':
      expandPoint('CIRCLE', e.center.x - e.radius, e.center.y - e.radius);
      expandPoint('CIRCLE', e.center.x + e.radius, e.center.y + e.radius);
      break;

    case 'ARC': {
      // Track for diagnostics only — excluded from viewBox via BOUNDS_TYPES.
      const { center, radius, startAngle, endAngle } = e;
      const start = normDeg(startAngle);
      const sweep = sweepDeg(startAngle, endAngle);
      const candidates = [start, normDeg(endAngle)];
      for (const axDeg of [0, 90, 180, 270]) {
        if (normDeg(axDeg - start) < sweep) candidates.push(axDeg);
      }
      for (const deg of candidates) {
        expandPoint('ARC',
          center.x + radius * Math.cos(deg * DEG),
          center.y + radius * Math.sin(deg * DEG),
        );
      }
      break;
    }

    case 'ELLIPSE': {
      // Track for diagnostics only — excluded from viewBox via BOUNDS_TYPES.
      const geom = ellipseGeom(e);
      const { rx, ry, rotRad } = geom;
      // Axis-aligned bounding box of the full rotated ellipse
      const hw = Math.sqrt((rx * Math.cos(rotRad)) ** 2 + (ry * Math.sin(rotRad)) ** 2);
      const hh = Math.sqrt((rx * Math.sin(rotRad)) ** 2 + (ry * Math.cos(rotRad)) ** 2);
      expandPoint('ELLIPSE', e.center.x - hw, e.center.y - hh);
      expandPoint('ELLIPSE', e.center.x + hw, e.center.y + hh);
      break;
    }

    case 'SPLINE':
      for (const cp of (e.controlPoints ?? [])) expandPoint('SPLINE', cp.x, cp.y);
      break;
  }
}

// Merge per-type bounds into overall bounds — exclude ARC/ELLIPSE (see BOUNDS_TYPES above).
let minX =  Infinity, minY =  Infinity;
let maxX = -Infinity, maxY = -Infinity;
for (const [type, b] of Object.entries(typeBounds)) {
  if (!BOUNDS_TYPES.has(type)) continue;
  if (b.minX < minX) minX = b.minX;
  if (b.maxX > maxX) maxX = b.maxX;
  if (b.minY < minY) minY = b.minY;
  if (b.maxY > maxY) maxY = b.maxY;
}

if (!isFinite(minX)) {
  // No geometry — use a 1×1 canvas
  minX = 0; minY = 0; maxX = 1; maxY = 1;
}

// 2 % padding
const rawW = maxX - minX;
const rawH = maxY - minY;
const pad  = Math.max(rawW, rawH) * 0.02;

const pMinX = minX - pad;
const pMinY = minY - pad;
const pMaxX = maxX + pad;
const pMaxY = maxY + pad;

const vbW = pMaxX - pMinX;
const vbH = pMaxY - pMinY;

// ── SVG entity renderers ──────────────────────────────────────────────────────

// Scale stroke-width to 0.05 % of the larger viewBox dimension so lines remain
// visible regardless of whether the drawing is millimetres-small or metres-large.
const strokeWidth = Math.max(vbW, vbH) * 0.0005;
const ATTRS = `stroke="#374151" stroke-width="${strokeWidth}" fill="none"`;

function renderLine(e) {
  const v0 = e.vertices?.[0] ?? e.start;
  const v1 = e.vertices?.[1] ?? e.end;
  if (!v0 || !v1) return '';
  return `<line x1="${v0.x}" y1="${v0.y}" x2="${v1.x}" y2="${v1.y}" ${ATTRS}/>`;
}

function polyPoints(verts) {
  return verts.map(v => `${v.x},${v.y}`).join(' ');
}

function renderLwpolyline(e) {
  const pts = polyPoints(e.vertices ?? []);
  if (e.shape) {
    return `<polygon points="${pts}" ${ATTRS}/>`;
  }
  return `<polyline points="${pts}" ${ATTRS}/>`;
}

function renderPolyline(e) {
  const verts = (e.vertices ?? []).map(v => ({ x: v.position?.x ?? v.x, y: v.position?.y ?? v.y }));
  const pts = polyPoints(verts);
  if (e.shape) {
    return `<polygon points="${pts}" ${ATTRS}/>`;
  }
  return `<polyline points="${pts}" ${ATTRS}/>`;
}

function renderCircle(e) {
  return `<circle cx="${e.center.x}" cy="${e.center.y}" r="${e.radius}" ${ATTRS}/>`;
}

function renderArc(e) {
  // ARC angles are in DEGREES. Convert to radians for trig.
  const { center, radius, startAngle, endAngle } = e;
  const x1 = center.x + radius * Math.cos(startAngle * DEG);
  const y1 = center.y + radius * Math.sin(startAngle * DEG);
  const x2 = center.x + radius * Math.cos(endAngle * DEG);
  const y2 = center.y + radius * Math.sin(endAngle * DEG);
  const largeArc = sweepDeg(startAngle, endAngle) > 180 ? 1 : 0;
  return `<path d="M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}" ${ATTRS}/>`;
}

function renderEllipse(e) {
  // ELLIPSE angles are in RADIANS (parametric, CCW from major axis).
  const geom = ellipseGeom(e);
  const { rx, ry, rotDeg } = geom;
  const startAngle = e.startAngle ?? 0;
  const endAngle   = e.endAngle   ?? (2 * Math.PI);
  const sweep      = endAngle - startAngle;

  // Full ellipse — use <ellipse> element (avoids degenerate path when start=end)
  if (Math.abs(sweep - 2 * Math.PI) < 1e-4 || Math.abs(sweep) < 1e-4) {
    return `<ellipse cx="${e.center.x}" cy="${e.center.y}" rx="${rx}" ry="${ry}" `
         + `transform="rotate(${rotDeg}, ${e.center.x}, ${e.center.y})" ${ATTRS}/>`;
  }

  // Partial ellipse — compute endpoints and use SVG arc path
  const p1 = ellipsePoint(e, geom, startAngle);
  const p2 = ellipsePoint(e, geom, endAngle);
  const largeArc = sweep > Math.PI ? 1 : 0;
  // sweep-flag=1 (CW in SVG) because the parent <g> has scale(1,-1), flipping CCW→CW
  return `<path d="M ${p1.x} ${p1.y} A ${rx} ${ry} ${rotDeg} ${largeArc} 1 ${p2.x} ${p2.y}" ${ATTRS}/>`;
}

function renderSpline(e) {
  const pts = polyPoints(e.controlPoints ?? []);
  return `<polyline points="${pts}" ${ATTRS}/>`;
}

function renderEntity(e) {
  switch (e.type) {
    case 'LINE':       return renderLine(e);
    case 'LWPOLYLINE': return renderLwpolyline(e);
    case 'POLYLINE':   return renderPolyline(e);
    case 'ARC':        return renderArc(e);
    case 'CIRCLE':     return renderCircle(e);
    case 'ELLIPSE':    return renderEllipse(e);
    case 'SPLINE':     return renderSpline(e);
    default:           return '';
  }
}

// ── Build SVG ─────────────────────────────────────────────────────────────────

const entityLines = entities.map(renderEntity).filter(Boolean).join('\n    ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}">
  <g transform="translate(${-pMinX}, ${pMaxY}) scale(1, -1)">
    ${entityLines}
  </g>
</svg>`;

// ── Build manifest ────────────────────────────────────────────────────────────

const panelId = basename(inputPath, extname(inputPath));

const manifest = {
  panelId,
  units: 'mm',
  dxfBounds: { minX: pMinX, minY: pMinY, maxX: pMaxX, maxY: pMaxY },
  viewBox: { x: 0, y: 0, w: vbW, h: vbH },
};

// ── Write output ──────────────────────────────────────────────────────────────

mkdirSync(outputDir, { recursive: true });

const svgPath      = join(outputDir, 'panel.svg');
const manifestPath = join(outputDir, 'manifest.json');

writeFileSync(svgPath,      svg);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('');
console.log('DXF → SVG conversion complete');
console.log('──────────────────────────────────────────');
console.log(`Input file  : ${inputPath}`);
console.log('');
console.log('Entity counts:');
for (const [type, n] of Object.entries(counts).sort()) {
  console.log(`  ${type.padEnd(14)} ${n}`);
}
console.log('');
console.log('Bounds per entity type (world-space):');
for (const [type, b] of Object.entries(typeBounds).sort()) {
  const w = (b.maxX - b.minX).toFixed(1);
  const h = (b.maxY - b.minY).toFixed(1);
  const flag = BOUNDS_TYPES.has(type) ? '' : ' [excluded from viewBox]';
  console.log(`  ${type.padEnd(14)} x:[${b.minX.toFixed(1)}, ${b.maxX.toFixed(1)}]  y:[${b.minY.toFixed(1)}, ${b.maxY.toFixed(1)}]  (${w} × ${h})${flag}`);
}
console.log('');
console.log('dxfBounds (padded world-space):');
console.log(`  minX = ${pMinX}`);
console.log(`  minY = ${pMinY}`);
console.log(`  maxX = ${pMaxX}`);
console.log(`  maxY = ${pMaxY}`);
console.log('');
console.log(`viewBox     : 0 0 ${vbW} ${vbH}`);
console.log('');
console.log('Files written:');
console.log(`  ${svgPath}`);
console.log(`  ${manifestPath}`);
console.log('');
