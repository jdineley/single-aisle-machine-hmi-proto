export interface PanelConfig {
  panelId: string;
  displayName: string;
  /** Directory under /public/panels/ used to load SVG + manifest. */
  assetId: string;
  isLegacy: boolean;
  /** Target total extra time as a fraction of the ideal total (e.g. 0.06 = 6% slower). */
  delayFraction: number;
  /** Number of individual fasteners that receive a delayed data-packet emit. */
  numDelayed: number;
  /** Seed for the deterministic RNG used when generating fastener statuses and delay positions. */
  seed: number;
}

export const PANELS: PanelConfig[] = [
  { panelId: 'panel101', displayName: 'Panel 101', assetId: 'test-panel', isLegacy: true,  delayFraction: 0.02, numDelayed: 5,  seed: 101 },
  { panelId: 'panel102', displayName: 'Panel 102', assetId: 'test-panel', isLegacy: true,  delayFraction: 0.06, numDelayed: 9,  seed: 202 },
  { panelId: 'panel103', displayName: 'Panel 103', assetId: 'test-panel', isLegacy: true,  delayFraction: 0.08, numDelayed: 12, seed: 303 },
  { panelId: 'panel104', displayName: 'Panel 104', assetId: 'test-panel', isLegacy: false, delayFraction: 0.10, numDelayed: 15, seed: 404 },
];

export const CURRENT_PANEL_ID = 'panel104';
export const MACHINE_NAME = 'Single Aisle - 4';
