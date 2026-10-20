/** Estimated plastic soil behavior. SI units; not fitted geotechnical data.
 * Compression consumes pore space; only the remaining bulk moves into piles.
 * Granular shoulders spread to their repose envelope. Cohesive mud can retain
 * a steeper face, while saturated mud slumps more readily. */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function soilFlow(surface, moisture = 0, compaction = 0, churn = 0) {
  const wet = clamp(moisture, 0, 1), packed = clamp(compaction, 0, 1);
  if (surface === 'dirt') return { displaced: .20, repose: .72, hardening: .12 };
  if (surface === 'sand') return { displaced: clamp(.82 - wet * .07 + churn * .04, 0, .90), repose: Math.tan((31 + wet * 5) * Math.PI / 180), hardening: .22 };
  if (surface === 'snow') return { displaced: .23 + packed * .24 + churn * .08, repose: Math.tan(34 * Math.PI / 180), hardening: .34 };
  return { displaced: surface === 'mud' ? .66 + wet * .10 + churn * .04 : .56 + wet * .06,
    repose: Math.tan((surface === 'mud' ? 43 - wet * 12 : 31) * Math.PI / 180), hardening: .12 - wet * .04 };
}

/** Redistribute capacity overflow instead of losing it at the first full node.
 * Values are node-height sums (all nodes share the same physical cell area).
 * Return the amount actually raised, including Float32 storage rounding. */
export function depositSoil(receivers, volume, read, write) {
  let remaining = volume, raised = 0;
  for (let pass = 0; pass < 4 && remaining > 1e-12; pass++) {
    const available = receivers.filter(item => item.maxBerm - read(item) > 1e-9);
    const weight = available.reduce((sum, item) => sum + item.weight, 0);
    if (!(weight > 0)) break;
    let used = 0;
    for (const item of available) {
      const old = read(item), next = Math.min(item.maxBerm, old + remaining * item.weight / weight);
      write(item, next);
      const gain = Math.max(0, read(item) - old); used += gain;
    }
    raised += used; remaining = Math.max(0, remaining - used);
    if (used < 1e-12) break;
  }
  return raised;
}
