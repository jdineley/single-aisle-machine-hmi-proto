export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DxfBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ViewManifest {
  panelId: string;
  units: 'mm' | 'inch';
  dxfBounds: DxfBounds;
  viewBox: ViewBox;
}

export type FastenerStatus = 'pending' | 'ok' | 'fail';

export interface FastenerPoint {
  fastId: string;
  worldX: number;
  worldY: number;
  status: FastenerStatus;
  payload: Record<string, unknown>;
}
