import type { Lap } from '@/api/swims';
import { formatDuration } from '@/lib/format';
import { lapsWithSwolf } from '@/lib/swim-metrics';

interface LapTableProps {
  laps: Lap[];
}

/** Per-lap detail: stroke, time, strokes, SWOLF (only when both time and stroke count exist). */
function LapTable({ laps }: LapTableProps) {
  const rows = lapsWithSwolf(laps);

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th className="px-3 py-2 font-medium">Lap</th>
            <th className="px-3 py-2 font-medium">Stroke</th>
            <th className="px-3 py-2 font-medium tabular-nums">Time</th>
            <th className="px-3 py-2 font-medium tabular-nums">Strokes</th>
            <th className="px-3 py-2 font-medium tabular-nums">SWOLF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((lap) => (
            <tr key={lap.index} className="border-b last:border-b-0">
              <td className="px-3 py-2 tabular-nums">{lap.index + 1}</td>
              <td className="px-3 py-2 capitalize">{lap.strokeStyle ?? '—'}</td>
              <td className="px-3 py-2 tabular-nums">{formatDuration(lap.durationSeconds)}</td>
              <td className="px-3 py-2 tabular-nums">{lap.strokeCount ?? '—'}</td>
              <td className="px-3 py-2 tabular-nums">{lap.swolf ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default LapTable;
