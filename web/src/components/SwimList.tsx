import { Link } from '@tanstack/react-router';
import type { SwimSummary } from '@/api/swims';
import {
  formatDateTime,
  formatDistanceMetres,
  formatDuration,
  formatPace,
  formatPoolLength,
} from '@/lib/format';
import { paceSecondsPer100m } from '@/lib/swim-metrics';

interface SwimListProps {
  swims: SwimSummary[];
}

/** Newest-first swim list; each row links to its detail route. */
function SwimList({ swims }: SwimListProps) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border">
      {swims.map((swim) => {
        const pace = paceSecondsPer100m(swim.activeDurationSeconds, swim.distanceMetres);
        return (
          <li key={swim.swimId}>
            <Link
              to="/swims/$swimId"
              params={{ swimId: swim.swimId }}
              className="hover:bg-muted flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors"
            >
              <div>
                <p className="font-medium">{formatDateTime(swim.startDate)}</p>
                <p className="text-muted-foreground text-xs">
                  {formatPoolLength(swim.poolLength)} · {swim.lapCount} laps
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium">{formatDistanceMetres(swim.distanceMetres)}</p>
                <p className="text-muted-foreground text-xs">
                  {formatDuration(swim.activeDurationSeconds)} · {formatPace(pace)} /100 m
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default SwimList;
