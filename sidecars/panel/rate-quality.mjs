// Summary-only timing checks: no chunk timestamps are exposed by this host.
// These flags mean unmeasurable/suspect, not proof of upstream buffering.
export const RATE_VERSION = 4;
export const RATE_REASONS = ['token-scope', 'duplicate-scope', 'retry-scope', 'short-tool-window', 'short-burst', 'short-outlier', 'short-window', 'nonfinite-rate'];
const UNRELIABLE_REASONS = new Set(['token-scope', 'duplicate-scope', 'retry-scope', 'nonfinite-rate']);
const BURST_REASONS = new Set(['short-tool-window', 'short-burst', 'short-outlier']);
export const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const sampleOutput = sample => sample.outputTokens !== undefined ? sample.outputTokens : sample.responseTokens;

export function classifySample(sample, limit) {
  const tokens = sampleOutput(sample);
  if (!Number.isFinite(sample.tps) && sample.duration > 0 && tokens !== null) sample.reasons.push('nonfinite-rate');
  // A tiny tool-only stream after a much longer wait gives no evidence that
  // its measured interval covers generation of the tool arguments.
  if (sample.duration > 0 && sample.duration < 1 && tokens > 0 && sample.toolOnly &&
      sample.ttft >= 2 && sample.ttft / sample.duration >= 20) sample.reasons.push('short-tool-window');
  // Non-tool single-chunk flush after a long wait (e.g. buffered thinking/reply).
  if (sample.duration > 0 && sample.duration < 0.3 && tokens >= 30 && !sample.toolOnly &&
      sample.ttft >= 2 && sample.ttft / sample.duration >= 15) sample.reasons.push('short-burst');
  sample.outlier = limit !== undefined && sample.tps > limit;
  // Distribution alone never rejects a sustained, potentially real high rate.
  if (sample.outlier && sample.duration < 1 && !sample.reasons.some(r => UNRELIABLE_REASONS.has(r) || r === 'short-tool-window')) {
    sample.reasons.push('short-outlier');
  }
  // Strict short-window and low-output quarantine: exclude < 1s or < 30 output
  // token bursts from decode rate aggregation while preserving usage and TTFT.
  if (sample.duration > 0 && tokens !== null && (sample.duration < 1 || tokens < 30)) sample.reasons.push('short-window');
  if (!sample.reasons.length) {
    sample.status = tokens === null || !(sample.duration > 0) ? 'missing' : 'ok';
  } else if (sample.reasons.some(r => UNRELIABLE_REASONS.has(r))) {
    sample.status = 'unreliable';
  } else if (sample.reasons.some(r => BURST_REASONS.has(r))) {
    sample.status = 'buffered';
  } else {
    sample.status = 'short';
  }
  return sample;
}

export function classifyRates(samples) {
  const profiles = new Map();
  for (const sample of samples) {
    const tokens = sampleOutput(sample);
    if (sample.reasons.length || !(sample.duration >= 1) || !(tokens >= 30) || !(sample.tps > 0)) continue;
    const key = sample.profile;
    if (!profiles.has(key)) profiles.set(key, []);
    profiles.get(key).push(sample.tps);
  }
  const limits = new Map();
  for (const [key, rates] of profiles) {
    if (rates.length < 5) continue;
    const center = median(rates), mad = median(rates.map(rate => Math.abs(rate - center)));
    limits.set(key, Math.max(center * 8, center + 12 * mad));
  }
  for (const sample of samples) classifySample(sample, limits.get(sample.profile));
  return samples;
}
