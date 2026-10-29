// Metrics for leave-one-out predictions. truth and predictions are on [-1, 1].
// A rating counts as negative when it is <= 0 (CLAUDE.md mapping), and so
// does a prediction: sign agreement means both > 0 or both <= 0.

/** RMSE (0-2) and Pearson correlation, as in Kumar et al. 2016, plus MAE and sign accuracy. */
export function regressionMetrics(truth, pred) {
  const n = truth.length;
  if (n === 0) return { n: 0, rmse: null, mae: null, pcc: null, signAccuracy: null, negativeSignAccuracy: null, negatives: 0 };
  let se = 0, ae = 0, sumT = 0, sumP = 0, signOk = 0, negatives = 0, negativeOk = 0;
  for (let i = 0; i < n; i++) {
    const err = pred[i] - truth[i];
    se += err * err;
    ae += Math.abs(err);
    sumT += truth[i];
    sumP += pred[i];
    const agree = (truth[i] > 0) === (pred[i] > 0);
    if (agree) signOk += 1;
    if (truth[i] <= 0) { negatives += 1; if (agree) negativeOk += 1; }
  }
  const meanT = sumT / n, meanP = sumP / n;
  let cov = 0, varT = 0, varP = 0;
  for (let i = 0; i < n; i++) {
    cov += (truth[i] - meanT) * (pred[i] - meanP);
    varT += (truth[i] - meanT) ** 2;
    varP += (pred[i] - meanP) ** 2;
  }
  return {
    n,
    rmse: Math.sqrt(se / n),
    mae: ae / n,
    // undefined (null) when either side is constant
    pcc: varT > 0 && varP > 0 ? cov / Math.sqrt(varT * varP) : null,
    signAccuracy: signOk / n,
    negativeSignAccuracy: negatives > 0 ? negativeOk / negatives : null,
    negatives
  };
}

/**
 * precision@k: for every source with at least k test edges, rank its test
 * targets by prediction (ties by target id, so the order is deterministic)
 * and take the share of the top k it actually rated positively. Averaged over
 * those sources. baseRate is the share of positive ratings among all test
 * edges of the same sources: what a random order would score.
 */
export function precisionAtK(cases, pred, k) {
  const bySource = new Map();
  cases.forEach((c, i) => {
    if (!bySource.has(c.source)) bySource.set(c.source, []);
    bySource.get(c.source).push(i);
  });
  let total = 0, base = 0, sources = 0;
  for (const indices of bySource.values()) {
    if (indices.length < k) continue;
    const ranked = [...indices].sort((a, b) => pred[b] - pred[a] || cases[a].target.localeCompare(cases[b].target));
    total += ranked.slice(0, k).filter(i => cases[i].truth > 0).length / k;
    base += indices.filter(i => cases[i].truth > 0).length / indices.length;
    sources += 1;
  }
  return { k, sources, precision: sources ? total / sources : null, baseRate: sources ? base / sources : null };
}

export function quantile(values, q) {
  if (values.length === 0) return null;
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** Deterministic PRNG (mulberry32): the same seed always gives the same sample and split. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded Fisher-Yates shuffle of 0..n-1. */
export function shuffledIndices(n, seed) {
  const random = seededRandom(seed);
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
