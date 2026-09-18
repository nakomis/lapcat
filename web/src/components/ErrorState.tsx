import { ApiError } from '@/api/swims';
import { Button } from '@/components/ui/button';

interface ErrorStateProps {
  error: unknown;
  onSignInAgain: () => void;
}

/** An error state that distinguishes an expired session (401) from anything else. */
function ErrorState({ error, onSignInAgain }: ErrorStateProps) {
  const isUnauthorised = error instanceof ApiError && error.status === 401;

  if (isUnauthorised) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
        <p className="mb-3">Your session has expired.</p>
        <Button onClick={onSignInAgain}>Sign in again</Button>
      </div>
    );
  }

  return (
    <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
      Couldn't load your swims. Please try again shortly.
    </div>
  );
}

export default ErrorState;
