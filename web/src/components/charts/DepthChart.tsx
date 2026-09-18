import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DepthSample } from '@/api/swims';
import { CHART_CHROME, CHART_PALETTE } from '@/lib/chart-colors';
import { formatTimeOfDay } from '@/lib/format';

interface DepthChartProps {
  samples: DepthSample[];
}

/** Depth over time — separate chart from water temperature (different units: one axis per chart). Y-axis reversed so deeper reads lower. */
function DepthChart({ samples }: DepthChartProps) {
  const data = samples.map((s) => ({ t: new Date(s.date).getTime(), metres: s.metres }));

  return (
    <ResponsiveContainer width="100%" height={180}>
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
          reversed
          tickFormatter={(v: number) => `${v}m`}
        />
        <Tooltip
          contentStyle={{
            background: CHART_CHROME.surface,
            border: `1px solid ${CHART_CHROME.grid}`,
          }}
          labelStyle={{ color: CHART_CHROME.textPrimary }}
          labelFormatter={(v) => formatTimeOfDay(Number(v))}
          formatter={(value) => [`${Number(value).toFixed(2)} m`, 'Depth']}
        />
        <Line
          type="monotone"
          dataKey="metres"
          stroke={CHART_PALETTE.violet}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default DepthChart;
