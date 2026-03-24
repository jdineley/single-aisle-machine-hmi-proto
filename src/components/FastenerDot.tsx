import { memo } from 'react';
import type { FastenerStatus } from '../types';
import styles from './FastenerDot.module.css';

const STATUS_COLOUR: Record<FastenerStatus, string> = {
  ok: '#22c55e',
  fail: '#ef4444',
  pending: '#f59e0b',
};

interface FastenerDotProps {
  cx: number;
  cy: number;
  status: FastenerStatus;
  selected: boolean;
  onClick?: () => void;
}

export default memo(
  function FastenerDot({ cx, cy, status, selected, onClick }: FastenerDotProps) {
    const colour = STATUS_COLOUR[status];
    return (
      <g
        className={styles.dot}
        style={{ transformOrigin: `${cx}px ${cy}px`, pointerEvents: 'all', cursor: 'pointer' }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onClick}
      >
        {selected && (
          <circle cx={cx} cy={cy} r={48} fill="none" stroke={colour} strokeWidth={3} />
        )}
        <circle cx={cx} cy={cy} r={10} fill={colour} stroke={colour} strokeWidth={6} />
      </g>
    );
  },
  // Re-render only when visual props change — onClick changes every FastenerLayer render
  // but does not affect the rendered output, so we exclude it from the comparison.
  (prev, next) =>
    prev.cx === next.cx &&
    prev.cy === next.cy &&
    prev.status === next.status &&
    prev.selected === next.selected,
);
