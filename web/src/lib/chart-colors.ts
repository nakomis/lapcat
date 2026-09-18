/**
 * Chart palette — the dataviz skill's default categorical set, re-validated
 * against this portal's actual dark chart surface (`--card: #21252b`, cards
 * sit on `--background: #282c34`) rather than the skill's own dark surface.
 * All 8 slots pass lightness/chroma/CVD/normal-vision on both surfaces; the
 * green slot (6) sits under 3:1 contrast on both, so it's used only with a
 * direct label or legend swatch, never as text.
 *
 *   node scripts/validate_palette.js "<hexes>" --mode dark --surface "#282c34"
 *   → ALL CHECKS PASS (green WARNs on contrast — relief rule: label it)
 */
export const CHART_PALETTE = {
  blue: '#3987e5',
  orange: '#d95926',
  aqua: '#199e70',
  yellow: '#c98500',
  magenta: '#d55181',
  green: '#008300',
  violet: '#9085e9',
  red: '#e66767',
} as const;

/** Stroke styles get fixed hues, in the palette's own validated order. */
export const STROKE_STYLE_COLORS: Record<string, string> = {
  freestyle: CHART_PALETTE.blue,
  backstroke: CHART_PALETTE.orange,
  breaststroke: CHART_PALETTE.aqua,
  butterfly: CHART_PALETTE.yellow,
  kickboard: CHART_PALETTE.magenta,
};

export function strokeStyleColor(style: string | undefined): string {
  return (style && STROKE_STYLE_COLORS[style]) || CHART_PALETTE.violet;
}

/** Chart chrome, taken from this app's own One Dark tokens (web/src/index.css). */
export const CHART_CHROME = {
  grid: '#3e4451',
  textMuted: 'rgba(255, 255, 255, 0.6)',
  textPrimary: '#ffffff',
  surface: '#21252b',
  restShade: 'rgba(255, 255, 255, 0.06)',
} as const;
