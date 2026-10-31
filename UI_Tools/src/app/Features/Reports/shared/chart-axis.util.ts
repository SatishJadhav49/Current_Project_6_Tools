//********************************************** Axis Helpers Start **********************************************//
// Shared by the SVG chart renderers (Box Plot, Pareto...)

/** "Nice" axis bounds and step (1, 2, 2.5, 5 × 10^n) */
export function niceScale(lo: number, hi: number, maxTicks: number): { min: number; max: number; step: number } {
  const range = niceNumber(hi - lo, false);
  const step = niceNumber(range / (maxTicks - 1), true);
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
}

function niceNumber(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let nice: number;
  if (round) nice = fraction < 1.5 ? 1 : fraction < 2.25 ? 2 : fraction < 3.5 ? 2.5 : fraction < 7.5 ? 5 : 10;
  else nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * 10 ** exponent;
}

export function formatTick(value: number, decimals: number): string {
  const fixed = Math.abs(value) < 1e-9 ? 0 : value;
  return fixed.toLocaleString('en-IN', { minimumFractionDigits: Math.min(decimals, 6), maximumFractionDigits: Math.min(decimals, 6) });
}

/** Decimals needed to print ticks of this step without noise */
export function tickDecimals(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}
//********************************************** Axis Helpers End **********************************************//
