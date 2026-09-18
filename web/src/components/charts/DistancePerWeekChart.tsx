import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_CHROME, CHART_PALETTE } from '@/lib/chart-colors';
import { formatDistanceMetres } from '@/lib/format';
import type { WeeklyDistance } from '@/lib/swim-metrics';

interface DistancePerWeekChartProps {
  data: WeeklyDistance[];
}

function weekLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/London',
  });
}

/** Bars — one series, so no legend box needed; the section title names it. */
function DistancePerWeekChart({ data }: DistancePerWeekChartProps) {
  const chartData = data.map((d) => ({ ...d, label: weekLabel(d.weekStart) }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={chartData}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        barCategoryGap="20%"
      >
        <CartesianGrid strokeDasharray="0" stroke={CHART_CHROME.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: CHART_CHROME.textMuted, fontSize: 12 }}
          axisLine={{ stroke: CHART_CHROME.grid }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: CHART_CHROME.textMuted, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatDistanceMetres(v)}
          width={64}
        />
        <Tooltip
          cursor={{ fill: CHART_CHROME.restShade }}
          contentStyle={{
            background: CHART_CHROME.surface,
            border: `1px solid ${CHART_CHROME.grid}`,
          }}
          labelStyle={{ color: CHART_CHROME.textPrimary }}
          formatter={(value) => [formatDistanceMetres(Number(value)), 'Distance']}
        />
        <Bar
          dataKey="distanceMetres"
          fill={CHART_PALETTE.blue}
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default DistancePerWeekChart;
