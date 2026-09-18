import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_CHROME, CHART_PALETTE } from '@/lib/chart-colors';
import { formatDate, formatPace } from '@/lib/format';

export interface PacePoint {
  startDate: string;
  paceSecondsPer100m: number | undefined;
}

interface PaceTrendChartProps {
  data: PacePoint[];
}

/** Line — one series (pace per 100 m over time); points with no computable pace are gapped, not zeroed. */
function PaceTrendChart({ data }: PaceTrendChartProps) {
  const chartData = data
    .filter((d) => d.paceSecondsPer100m !== undefined)
    .map((d) => ({ date: d.startDate, pace: d.paceSecondsPer100m }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="0" stroke={CHART_CHROME.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(v: string) => formatDate(v)}
          tick={{ fill: CHART_CHROME.textMuted, fontSize: 12 }}
          axisLine={{ stroke: CHART_CHROME.grid }}
          tickLine={false}
          minTickGap={32}
        />
        <YAxis
          tick={{ fill: CHART_CHROME.textMuted, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatPace(v)}
          width={48}
          reversed
        />
        <Tooltip
          contentStyle={{
            background: CHART_CHROME.surface,
            border: `1px solid ${CHART_CHROME.grid}`,
          }}
          labelStyle={{ color: CHART_CHROME.textPrimary }}
          labelFormatter={(v) => formatDate(String(v))}
          formatter={(value) => [formatPace(Number(value)), 'Pace / 100 m']}
        />
        <Line
          type="monotone"
          dataKey="pace"
          stroke={CHART_PALETTE.blue}
          strokeWidth={2}
          dot={{ r: 4, fill: CHART_PALETTE.blue, stroke: CHART_CHROME.surface, strokeWidth: 2 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default PaceTrendChart;
