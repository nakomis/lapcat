import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HeartRateSample, Pause } from '@/api/swims';
import { CHART_CHROME, CHART_PALETTE } from '@/lib/chart-colors';
import { formatTimeOfDay } from '@/lib/format';

interface HeartRateChartProps {
  heartRate: HeartRateSample[];
  pauses: Pause[];
}

/** Heart rate over time, one series, with rest periods (from `pauses`) shaded behind the line. */
function HeartRateChart({ heartRate, pauses }: HeartRateChartProps) {
  const data = heartRate.map((sample) => ({
    date: sample.date,
    bpm: sample.bpm,
    t: new Date(sample.date).getTime(),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="0" stroke={CHART_CHROME.grid} vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(v) => formatTimeOfDay(Number(v))}
          tick={{ fill: CHART_CHROME.textMuted, fontSize: 12 }}
          axisLine={{ stroke: CHART_CHROME.grid }}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          tick={{ fill: CHART_CHROME.textMuted, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={40}
          label={{
            value: 'bpm',
            angle: -90,
            position: 'insideLeft',
            fill: CHART_CHROME.textMuted,
            fontSize: 11,
          }}
        />
        {pauses.map((pause) => (
          <ReferenceArea
            key={pause.startDate}
            x1={new Date(pause.startDate).getTime()}
            x2={new Date(pause.endDate).getTime()}
            fill={CHART_CHROME.restShade}
            stroke="none"
          />
        ))}
        <Tooltip
          contentStyle={{
            background: CHART_CHROME.surface,
            border: `1px solid ${CHART_CHROME.grid}`,
          }}
          labelStyle={{ color: CHART_CHROME.textPrimary }}
          labelFormatter={(v) => formatTimeOfDay(Number(v))}
          formatter={(value) => [`${Math.round(Number(value))} bpm`, 'Heart rate']}
        />
        <Line
          type="monotone"
          dataKey="bpm"
          stroke={CHART_PALETTE.red}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default HeartRateChart;
