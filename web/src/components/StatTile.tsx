interface StatTileProps {
  label: string;
  value: string;
  unit?: string;
}

/** A single stat-tile: label (sentence case), value in large proportional figures, optional unit. */
function StatTile({ label, value, unit }: StatTileProps) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-2xl font-semibold">
        {value}
        {unit && <span className="text-muted-foreground ml-1 text-sm font-normal">{unit}</span>}
      </p>
    </div>
  );
}

export default StatTile;
