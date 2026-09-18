/**
 * Eastern-time day-boundary math, used to give sighting threads a real calendar-day identity
 * (Pittsburgh is the community this bot serves) instead of a rolling N-hours-since-creation
 * window. Handled by hand via Intl rather than pulling in a date library — the only two things
 * we need are "what Y/M/D is this instant, in Eastern" and "what's Eastern's UTC offset on that
 * date" (which shifts across DST), and both are one Intl call each.
 */

const EASTERN_TZ = 'America/New_York';

const DATE_PARTS_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TZ,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

const OFFSET_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TZ,
  timeZoneName: 'shortOffset',
});

interface EasternDateParts {
  year: number;
  month: number; // 1-12
  day: number;
}

function easternDateParts(ms: number): EasternDateParts {
  const parts = DATE_PARTS_FORMAT.formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Eastern's UTC offset in whole hours (e.g. -4 for EDT, -5 for EST) at the given instant. */
function easternOffsetHours(ms: number): number {
  const part = OFFSET_FORMAT.formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')!.value;
  const match = part.match(/GMT([+-]\d+)/);
  return match ? Number(match[1]) : -5; // fall back to EST if the format ever surprises us
}

/** Epoch ms for 00:00:00.000 Eastern of the calendar day containing `ms`. */
export function startOfEasternDay(ms: number): number {
  const { year, month, day } = easternDateParts(ms);
  const naiveUtcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0);
  // Probe the offset right at the naive UTC midnight guess, not later in the day (e.g. noon) —
  // Eastern's DST transitions always land around 2 AM local, hours after actual local midnight,
  // so this always reflects the offset actually in effect at that midnight instant. Probing later
  // in the day would pick up the *post-transition* offset on fall-back day and be off by an hour.
  const offsetHours = easternOffsetHours(naiveUtcMidnight);
  return naiveUtcMidnight - offsetHours * 60 * 60 * 1000;
}

/**
 * Epoch ms for 00:00:00.000 Eastern of the calendar day *after* the one containing `ms`.
 * Jumps forward 25h (guaranteed to clear even a 23h short DST day) then snaps back to that
 * day's own start, so it's exact regardless of DST irregularities.
 */
export function startOfNextEasternDay(ms: number): number {
  const thisDayStart = startOfEasternDay(ms);
  return startOfEasternDay(thisDayStart + 25 * 60 * 60 * 1000);
}

/** "M/D/YY" for the Eastern calendar day containing `ms`, e.g. "9/4/26". */
export function formatEasternShortDate(ms: number): string {
  const { year, month, day } = easternDateParts(ms);
  return `${month}/${day}/${String(year).slice(-2)}`;
}
