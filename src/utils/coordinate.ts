import type { ViewBox, ViewManifest } from '../types';

/**
 * Clamps vb within bounds so the user cannot pan/zoom to empty space.
 * If vb is larger than bounds on an axis, centres it on that axis.
 */
export function clampViewBox(vb: ViewBox, bounds: ViewBox): ViewBox {
  let { x, y, w, h } = vb;

  if (w >= bounds.w) {
    x = bounds.x - (w - bounds.w) / 2;
  } else {
    x = Math.max(bounds.x, Math.min(x, bounds.x + bounds.w - w));
  }

  if (h >= bounds.h) {
    y = bounds.y - (h - bounds.h) / 2;
  } else {
    y = Math.max(bounds.y, Math.min(y, bounds.y + bounds.h - h));
  }

  return { x, y, w, h };
}

/**
 * Maps a DXF world coordinate (CAD space, Y-up) to an SVG viewBox coordinate (Y-down).
 * Pure function — no side effects.
 */
export function worldToViewBox(
  worldX: number,
  worldY: number,
  manifest: ViewManifest,
): { svgX: number; svgY: number } {
  const { dxfBounds, viewBox } = manifest;

  // Translate so DXF origin maps to viewBox origin
  const svgX = viewBox.x + (worldX - dxfBounds.minX);

  // Flip Y: CAD Y-up → SVG Y-down
  // In CAD space, worldY=minY is the bottom edge → maps to SVG bottom (viewBox.y + viewBox.h)
  // In CAD space, worldY=maxY is the top edge  → maps to SVG top    (viewBox.y)
  const svgY = viewBox.y + (dxfBounds.maxY - worldY);

  return { svgX, svgY };
}

/**
 * Returns a new ViewBox zoomed toward focalPoint by scaleFactor.
 * focalPoint is expressed in viewBox coordinate space.
 * scaleFactor > 1 zooms in, < 1 zooms out.
 */
export function zoomViewBox(
  current: ViewBox,
  focalPoint: { x: number; y: number },
  scaleFactor: number,
): ViewBox {
  const newW = current.w / scaleFactor;
  const newH = current.h / scaleFactor;

  // Keep focalPoint fixed: solve for new x/y so that
  //   (focalPoint.x - current.x) / current.w === (focalPoint.x - newX) / newW
  const newX = focalPoint.x - (focalPoint.x - current.x) * (newW / current.w);
  const newY = focalPoint.y - (focalPoint.y - current.y) * (newH / current.h);

  return { x: newX, y: newY, w: newW, h: newH };
}
