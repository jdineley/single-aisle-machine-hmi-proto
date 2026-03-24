import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import styles from './ProcessProgress.module.css';

interface ProcessProgressProps {
  idealTimestamps: number[];
  actualTimestamps: number[];
  /** For legacy panels this equals the full count; for the live panel it tracks the feed. */
  revealedCount: number;
  legacy: boolean;
}

function fmtHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export default function ProcessProgress({
  idealTimestamps,
  actualTimestamps,
  revealedCount,
  legacy,
}: ProcessProgressProps) {
  const chartData = useMemo(() => {
    const cutoff = legacy ? actualTimestamps.length : revealedCount;
    return idealTimestamps.map((idealSec, i) => ({
      fastener: i + 1,
      ideal:  +(idealSec / 3600).toFixed(5),
      actual: i < cutoff ? +(actualTimestamps[i] / 3600).toFixed(5) : undefined,
    }));
  }, [idealTimestamps, actualTimestamps, legacy, revealedCount]);

  const totalFasteners = idealTimestamps.length;

  return (
    <div className={styles.container}>
      <p className={styles.heading}>Process Progress</p>
      <div className={styles.chart}>
        {/* <div className={styles.chartInner}> */}
        <ResponsiveContainer width="100%" height={700}>
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 28, bottom: 28, left: 56 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.45} />

            <XAxis
              dataKey="fastener"
              type="number"
              domain={[1, totalFasteners]}
              tickCount={8}
              tickFormatter={(v: number) => v.toLocaleString()}
              label={{
                value: 'Fastener No.',
                position: 'bottom',
                offset: -14,
                fontSize: 11,
                fill: '#64748b',
                fontFamily: 'monospace',
              }}
              tick={{ fontSize: 11, fontFamily: 'monospace', fill: '#64748b' }}
              stroke="#334155"
            />

            <YAxis
              tickFormatter={fmtHours}
              label={{
                value: 'Time',
                angle: -90,
                position: 'insideLeft',
                offset: -40,
                fontSize: 11,
                fill: '#64748b',
                fontFamily: 'monospace',
              }}
              tick={{ fontSize: 11, fontFamily: 'monospace', fill: '#64748b' }}
              stroke="#334155"
              domain={[0, 'auto']}
            />

            <Tooltip
              formatter={(value, name) => [
                fmtHours(Number(value)),
                name === 'ideal' ? 'Ideal' : 'Actual',
              ]}
              labelFormatter={(label) => `Fastener #${Number(label).toLocaleString()}`}
              contentStyle={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '0.78rem',
              }}
              labelStyle={{ color: '#f1f5f9', marginBottom: '2px' }}
              itemStyle={{ color: '#94a3b8' }}
            />

            <Legend
              formatter={(value) => (value === 'ideal' ? 'Ideal' : 'Actual')}
              wrapperStyle={{ fontSize: '0.78rem', fontFamily: 'monospace', paddingTop: '4px' }}
            />

            {/* Ideal — dashed reference line */}
            <Line
              type="linear"
              dataKey="ideal"
              stroke="#64748b"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 3, fill: '#64748b', strokeWidth: 0 }}
              isAnimationActive={false}
              connectNulls={false}
            />

            {/* Actual — solid, grows with revealedCount */}
            <Line
              type="linear"
              dataKey="actual"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#3b82f6', stroke: '#f1f5f9', strokeWidth: 1.5 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {/* </div> */}
      </div>
    </div>
  );
}
