interface LoadingSkeletonProps {
  rows?: number;
}

// Fixed pool of keys, sliced to the requested row count — skeleton rows have
// no identity of their own and never reorder, but a stable literal key (not
// derived from the map index) keeps the linter's index-key check honest.
const ROW_KEYS = ['row-a', 'row-b', 'row-c', 'row-d', 'row-e', 'row-f', 'row-g', 'row-h'];

/** A simple pulsing placeholder shown while swim data is loading. */
function LoadingSkeleton({ rows = 3 }: LoadingSkeletonProps) {
  return (
    <div role="status" aria-label="Loading swims" className="animate-pulse space-y-3">
      {ROW_KEYS.slice(0, rows).map((key) => (
        <div key={key} className="h-16 rounded-xl border bg-card" />
      ))}
    </div>
  );
}

export default LoadingSkeleton;
