/** Shared browser/server launch contract. No customer data or credentials belong here. */
export const LAUNCH = Object.freeze({
  at: '2026-11-01T09:00:00.000Z',
  timezone: 'Europe/London',
  label: '1 November 2026 · 9am UK time',
  offer: 'One free month of NUFI+ for everyone completing the programme finder.',
  version: 'nufi-launch-2026-12-v1',
});

export function countdownParts(now = Date.now()) {
  const value = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(value)) throw new TypeError('A valid timestamp is required.');
  const milliseconds = Math.max(0, Date.parse(LAUNCH.at) - value);
  const minutes = Math.floor(milliseconds / 60000);
  return { days: Math.floor(minutes / 1440), hours: Math.floor(minutes / 60) % 24,
    minutes: minutes % 60, reached: milliseconds === 0 };
}

/** The date alone never opens unfinished purchasing or app access. */
export function launchState(now = Date.now(), releaseEnabled = false) {
  if (!countdownParts(now).reached) return 'prelaunch';
  return releaseEnabled === true ? 'live' : 'awaiting-release';
}

/** Calendar-month expiry, clamped to the last day of shorter months. */
export function freeMonthEndsAt(activatedAt) {
  const start = new Date(activatedAt);
  if (!Number.isFinite(start.getTime())) throw new TypeError('A valid activation date is required.');
  if (start.getTime() < Date.parse(LAUNCH.at)) throw new RangeError('App access cannot activate before launch.');
  const result = new Date(start);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return result.toISOString();
}
