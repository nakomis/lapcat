import { Link, useParams } from '@tanstack/react-router';
import { useAuth } from 'react-oidc-context';
import AppHeader from '@/components/AppHeader';
import DepthChart from '@/components/charts/DepthChart';
import HeartRateChart from '@/components/charts/HeartRateChart';
import LapSplitsChart from '@/components/charts/LapSplitsChart';
import WaterTemperatureChart from '@/components/charts/WaterTemperatureChart';
import ErrorState from '@/components/ErrorState';
import Footer from '@/components/Footer';
import LapTable from '@/components/LapTable';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import StatTile from '@/components/StatTile';
import StrokeStyleLegend from '@/components/StrokeStyleLegend';
import { Spinner } from '@/components/ui/spinner';
import { useSwimDetail } from '@/hooks/useSwimDetail';
import { signOut } from '@/lib/auth';
import {
  formatDate,
  formatDistanceMetres,
  formatDuration,
  formatPace,
  formatPoolLength,
} from '@/lib/format';
import { paceSecondsPer100m } from '@/lib/swim-metrics';

function SwimDetail() {
  const auth = useAuth();
  const { swimId } = useParams({ from: '/swims/$swimId' });
  const { summary, blob, loading, error } = useSwimDetail(swimId);

  if (auth.isLoading) {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center gap-2 p-8">
        <Spinner /> Loading…
      </div>
    );
  }

  const pace = summary
    ? paceSecondsPer100m(summary.activeDurationSeconds, summary.distanceMetres)
    : undefined;
  const totals = blob?.totals;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader onSignOut={() => signOut(auth)} />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 p-4 sm:p-8">
        <Link to="/" className="text-primary text-sm hover:underline">
          ← Back to swims
        </Link>

        {loading && <LoadingSkeleton rows={5} />}

        {!loading && !!error && (
          <ErrorState error={error} onSignInAgain={() => void auth.signinRedirect()} />
        )}

        {!loading && !error && summary && (
          <>
            <div>
              <h1 className="text-2xl font-normal">{formatDate(summary.startDate)} swim</h1>
              <p className="text-muted-foreground text-sm">
                {formatPoolLength(summary.poolLength)} · {summary.lapCount} laps
              </p>
            </div>

            <section>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <StatTile label="Distance" value={formatDistanceMetres(summary.distanceMetres)} />
                <StatTile label="Laps" value={String(summary.lapCount)} />
                <StatTile
                  label="Active time"
                  value={formatDuration(summary.activeDurationSeconds)}
                />
                <StatTile
                  label="Elapsed time"
                  value={formatDuration(summary.elapsedDurationSeconds)}
                />
                <StatTile label="Avg pace" value={formatPace(pace)} unit="/100 m" />
                {totals?.strokeCount !== undefined && (
                  <StatTile label="Strokes" value={String(totals.strokeCount)} />
                )}
                {totals?.activeEnergyKcal !== undefined && (
                  <StatTile label="Energy" value={totals.activeEnergyKcal.toFixed(0)} unit="kcal" />
                )}
              </div>
            </section>

            {blob && (
              <>
                <section>
                  <h2 className="mb-3 text-sm font-medium">Lap splits</h2>
                  <div className="rounded-xl border bg-card p-4">
                    <LapSplitsChart laps={blob.laps} />
                    <StrokeStyleLegend strokeStyles={blob.laps.map((l) => l.strokeStyle ?? '')} />
                  </div>
                </section>

                <section>
                  <h2 className="mb-3 text-sm font-medium">Heart rate</h2>
                  <div className="rounded-xl border bg-card p-4">
                    <HeartRateChart heartRate={blob.heartRate} pauses={blob.pauses} />
                    {blob.pauses.length > 0 && (
                      <p className="text-muted-foreground mt-2 text-xs">
                        Shaded areas mark rest periods.
                      </p>
                    )}
                  </div>
                </section>

                {blob.submersion && (
                  <section>
                    <h2 className="mb-3 text-sm font-medium">Water temperature &amp; depth</h2>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-xl border bg-card p-4">
                        <WaterTemperatureChart samples={blob.submersion.waterTemperature} />
                      </div>
                      <div className="rounded-xl border bg-card p-4">
                        <DepthChart samples={blob.submersion.depth} />
                      </div>
                    </div>
                  </section>
                )}

                <section>
                  <h2 className="mb-3 text-sm font-medium">Laps</h2>
                  <LapTable laps={blob.laps} />
                </section>
              </>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default SwimDetail;
