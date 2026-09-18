import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Lap } from '@/api/swims';
import { CHART_CHROME, strokeStyleColor } from '@/lib/chart-colors';
import { formatDuration } from '@/lib/format';

interface LapSplitsChartProps {
  laps: Lap[];
}

/** One bar per lap, coloured by stroke style. Legend lives alongside as a separate component (see StrokeStyleLegend). */
function LapSplitsChart({ laps }: LapSplitsChartProps) {
  const data = laps.map((lap) => ({
    index: lap.index + 1,
    durationSeconds: lap.durationSeconds,
    strokeStyle: lap.strokeStyle,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="15%">
        <CartesianGrid strokeDasharray="0" stroke={CHART_CHROME.grid} vertical={false} />
        <XAxis
          dataKey="index"
          tick={{ fill: CHART_CHROME.textMuted, fontSize: 11 }}
          axisLine={{ stroke: CHART_CHROME.grid }}
          tickLine={false}
          label={{
            value: 'Lap',
            position: 'insideBottom',
            offset: -2,
            fill: CHART_CHROME.textMuted,
            fontSize: 11,
          }}
        />
        <YAxis
          tick={{ fill: CHART_CHROME.textMuted, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatDuration(v)}
          width={48}
        />
        <Tooltip
          contentStyle={{
            background: CHART_CHROME.surface,
            border: `1px solid ${CHART_CHROME.grid}`,
          }}
          labelStyle={{ color: CHART_CHROME.textPrimary }}
          labelFormatter={(v) => `Lap ${v}`}
          formatter={(value, _name, item) => [
            formatDuration(Number(value)),
            (item?.payload as { strokeStyle?: string })?.strokeStyle ?? 'duration',
          ]}
        />
        <Bar dataKey="durationSeconds" radius={[4, 4, 0, 0]} maxBarSize={24}>
          {data.map((entry) => (
            <Cell key={entry.index} fill={strokeStyleColor(entry.strokeStyle)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default LapSplitsChart;
