import type { FastenerPoint, FastenerStatus } from '../types';
import styles from './DetailPanel.module.css';

const STATUS_COLOUR: Record<FastenerStatus, string> = {
  ok: '#22c55e',
  fail: '#ef4444',
  pending: '#f59e0b',
};

const STATUS_LABEL: Record<FastenerStatus, string> = {
  ok: 'OK',
  fail: 'FAIL',
  pending: 'PENDING',
};

interface DetailPanelProps {
  point: FastenerPoint;
  onClose: () => void;
}

export default function DetailPanel({ point, onClose }: DetailPanelProps) {
  const payloadEntries = Object.entries(point.payload);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <p className={styles.fastId}>{point.fastId}</p>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
      </div>

      <span
        className={styles.badge}
        style={{ backgroundColor: STATUS_COLOUR[point.status] }}
      >
        {STATUS_LABEL[point.status]}
      </span>

      <p className={styles.sectionLabel}>World position</p>
      <div className={styles.row}>
        <span className={styles.rowKey}>X</span>
        <span className={styles.rowVal}>{point.worldX} mm</span>
      </div>
      <div className={styles.row}>
        <span className={styles.rowKey}>Y</span>
        <span className={styles.rowVal}>{point.worldY} mm</span>
      </div>

      <p className={styles.sectionLabel}>Process data</p>
      {payloadEntries.length === 0 ? (
        <span className={styles.noData}>No data recorded</span>
      ) : (
        payloadEntries.map(([key, value]) => (
          <div key={key} className={styles.row}>
            <span className={styles.rowKey}>{key}</span>
            <span className={styles.rowVal}>{String(value)}</span>
          </div>
        ))
      )}

      <div className={styles.footer}>fastId: {point.fastId}</div>
    </div>
  );
}
