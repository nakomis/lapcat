import { strokeStyleColor } from '@/lib/chart-colors';

interface StrokeStyleLegendProps {
  strokeStyles: string[];
}

/** Legend for lap-splits chart colouring — always shown alongside a colour-by-category chart. */
function StrokeStyleLegend({ strokeStyles }: StrokeStyleLegendProps) {
  const unique = Array.from(new Set(strokeStyles.filter(Boolean)));
  if (unique.length === 0) {
    return null;
  }
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {unique.map((style) => (
        <li key={style} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: strokeStyleColor(style) }}
            aria-hidden="true"
          />
          <span className="text-muted-foreground capitalize">{style}</span>
        </li>
      ))}
    </ul>
  );
}

export default StrokeStyleLegend;
