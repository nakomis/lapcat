interface EmptyStateProps {
  message: string;
}

function EmptyState({ message }: EmptyStateProps) {
  return (
    <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
      {message}
    </p>
  );
}

export default EmptyState;
