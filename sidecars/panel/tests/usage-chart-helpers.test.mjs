import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// The helpers live inside the usage-ui factory (the panel bundle only inlines
// the factory body), so tests extract the marked block directly from source.
const source = readFileSync(new URL('../../../compat/usage-ui.cjs', import.meta.url), 'utf8');
const markerStart = source.indexOf('// usage-chart-helpers:start');
const markerEnd = source.indexOf('// usage-chart-helpers:end');
assert.ok(markerStart > 0 && markerEnd > markerStart, 'usage-chart-helpers markers must exist in compat/usage-ui.cjs');
const {thinXLabels, presetRange, clampRange, chartBuckets, addDays, weekStart, addMonths} =
  new Function(source.slice(markerStart, markerEnd) + '; return usageChartHelpers;')();

test('thinXLabels keeps every label when they fit the available width', () => {
  assert.deepEqual(thinXLabels([40, 40, 40], 200), [true, true, true]);
  assert.deepEqual(thinXLabels([], 100), []);
});

test('thinXLabels skips labels by the smallest step that fits and always keeps the last', () => {
  // 5 x 50px = 250 > 200: step 2 keeps indices 0,2,4 = 150px.
  assert.deepEqual(thinXLabels([50, 50, 50, 50, 50], 200), [true, false, true, false, true]);
  // Very narrow budget: only the first and the last label survive.
  const thinned = thinXLabels([60, 60, 60, 60], 120);
  assert.equal(thinned.at(-1), true);
  assert.equal(thinned.filter(Boolean).length, 2);
  // Last label is never dropped even when it alone overflows the estimate.
  assert.equal(thinXLabels([10, 10, 500], 100).at(-1), true);
  // Penultimate label too close to the last label is dropped to prevent overlap.
  const noCollide = thinXLabels([50, 50, 50, 50, 50, 50], 220);
  assert.deepEqual(noCollide, [true, false, true, false, false, true]);
});

test('presetRange computes day-based presets inclusive of today', () => {
  assert.deepEqual(presetRange('7d', '2026-11-23'), {from: '2026-11-17', to: '2026-11-23'});
  assert.deepEqual(presetRange('30d', '2026-11-23'), {from: '2026-10-25', to: '2026-11-23'});
  assert.deepEqual(presetRange('90d', '2026-11-23'), {from: '2026-08-26', to: '2026-11-23'});
});

test('presetRange computes calendar presets including cross-month and cross-year', () => {
  assert.deepEqual(presetRange('thisMonth', '2026-11-23'), {from: '2026-11-01', to: '2026-11-23'});
  assert.deepEqual(presetRange('lastMonth', '2026-11-23'), {from: '2026-10-01', to: '2026-10-31'});
  // January rolls back into the previous year.
  assert.deepEqual(presetRange('lastMonth', '2026-01-15'), {from: '2025-12-01', to: '2025-12-31'});
  assert.equal(presetRange('nope', '2026-11-23'), null);
  assert.equal(presetRange('7d', 'not-a-date'), null);
});

test('clampRange clamps to [firstDate, today] and rejects inverted ranges', () => {
  assert.deepEqual(clampRange({from: '2024-01-01', to: '2026-12-31'}, '2026-10-01', '2026-11-23'),
    {from: '2026-10-01', to: '2026-11-23'});
  assert.deepEqual(clampRange({from: '2026-11-01', to: '2026-11-30'}, null, '2026-11-23'),
    {from: '2026-11-01', to: '2026-11-23'});
  assert.equal(clampRange({from: '2026-11-10', to: '2026-11-01'}, null, null), null);
  assert.equal(clampRange({from: '', to: '2026-11-01'}, null, null), null);
});

test('chartBuckets splits day ranges into one bucket per day', () => {
  assert.deepEqual(chartBuckets({from: '2026-11-22', to: '2026-11-24'}, 'day'),
    [{from: '2026-11-22', to: '2026-11-22'}, {from: '2026-11-23', to: '2026-11-23'}, {from: '2026-11-24', to: '2026-11-24'}]);
});

test('chartBuckets aligns week buckets to Monday and clips partial weeks', () => {
  // 2026-10-20 is a Tuesday; first and last buckets are clipped to the range.
  assert.deepEqual(chartBuckets({from: '2026-10-20', to: '2026-11-05'}, 'week'), [
    {from: '2026-10-20', to: '2026-10-25'},
    {from: '2026-10-26', to: '2026-11-01'},
    {from: '2026-11-02', to: '2026-11-05'},
  ]);
  assert.equal(weekStart('2026-11-25'), '2026-11-23');
});

test('chartBuckets splits month ranges across month boundaries', () => {
  assert.deepEqual(chartBuckets({from: '2026-10-20', to: '2026-12-05'}, 'month'), [
    {from: '2026-10-20', to: '2026-10-31'},
    {from: '2026-11-01', to: '2026-11-30'},
    {from: '2026-12-01', to: '2026-12-05'},
  ]);
});

test('chartBuckets handles single-day and empty/inverted ranges', () => {
  assert.deepEqual(chartBuckets({from: '2026-11-23', to: '2026-11-23'}, 'day'),
    [{from: '2026-11-23', to: '2026-11-23'}]);
  assert.deepEqual(chartBuckets({from: '2026-11-23', to: '2026-11-23'}, 'month'),
    [{from: '2026-11-23', to: '2026-11-23'}]);
  assert.deepEqual(chartBuckets({from: '2026-11-10', to: '2026-11-01'}, 'day'), []);
  assert.deepEqual(chartBuckets(null, 'day'), []);
});

test('date helpers round-trip across month and year boundaries', () => {
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  // addMonths anchors on the first of the month, so overflow days clamp forward.
  assert.equal(addMonths('2026-01-31', 1), '2026-02-01');

  assert.equal(addMonths('2025-12-15', 1), '2026-01-01');
});
