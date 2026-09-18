import type { ReactNode } from 'react';
import { useAuth } from 'react-oidc-context';
import AppHeader from '@/components/AppHeader';
import DistancePerWeekChart from '@/components/charts/DistancePerWeekChart';
import PaceTrendChart from '@/components/charts/PaceTrendChart';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import Footer from '@/components/Footer';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import SignInScreen from '@/components/SignInScreen';
import StatTile from '@/components/StatTile';
import SwimList from '@/components/SwimList';
import { Spinner } from '@/components/ui/spinner';
import { useSwims } from '@/hooks/useSwims';
import { signOut } from '@/lib/auth';
import { formatDistanceMetres, formatDuration, formatPace } from '@/lib/format';
import { last30DaysStats, paceSecondsPer100m, weeklyDistanceBuckets } from '@/lib/swim-metrics';

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground flex min-h-screen items-center justify-center gap-2 p-8">
      {children}
    </div>
  );
}

function Home() {
  const auth = useAuth();
  const { swims, loading, error } = useSwims();

  if (auth.isLoading) {
    return (
      <CenteredMessage>
        <Spinner /> Loading…
      </CenteredMessage>
    );
  }

  if (auth.error) {
    return <CenteredMessage>Error: {auth.error.message}</CenteredMessage>;
  }

  if (!auth.isAuthenticated) {
    return <SignInScreen onSignIn={() => void auth.signinRedirect()} />;
  }

  const email = auth.user?.profile.email;
  const stats = swims ? last30DaysStats(swims) : undefined;
  const weeklyDistance = swims ? weeklyDistanceBuckets(swims, 6) : [];
  const pacePoints = swims
    ? [...swims]
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .map((s) => ({
          startDate: s.startDate,
          paceSecondsPer100m: paceSecondsPer100m(s.activeDurationSeconds, s.distanceMetres),
        }))
    : [];

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader onSignOut={() => signOut(auth)} />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 p-4 sm:p-8">
        <h1 className="text-2xl font-normal">{email ? `Hello ${email}` : 'Hello'}</h1>

        {loading && <LoadingSkeleton rows={4} />}

        {!loading && !!error && (
          <ErrorState error={error} onSignInAgain={() => void auth.signinRedirect()} />
        )}

        {!loading && !error && swims && swims.length === 0 && (
          <EmptyState message="Your swims will appear here" />
        )}

        {!loading && !error && swims && swims.length > 0 && stats && (
          <>
            <section>
              <h2 className="mb-3 text-sm font-medium">Last 30 days</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Swims" value={String(stats.swimCount)} />
                <StatTile label="Distance" value={formatDistanceMetres(stats.distanceMetres)} />
                <StatTile label="Active time" value={formatDuration(stats.activeDurationSeconds)} />
                <StatTile
                  label="Avg pace"
                  value={formatPace(stats.averagePaceSecondsPer100m)}
                  unit="/100 m"
                />
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-medium">Distance per week</h2>
              <div className="rounded-xl border bg-card p-4">
                <DistancePerWeekChart data={weeklyDistance} />
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-medium">Pace over time</h2>
              <div className="rounded-xl border bg-card p-4">
                <PaceTrendChart data={pacePoints} />
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-medium">Swims</h2>
              <SwimList swims={swims} />
            </section>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default Home;
