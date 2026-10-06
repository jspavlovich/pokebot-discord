/**
 * Parsing/formatting for Walmart's "Drawing starts" badge text (e.g. "Oct 07, 2:00pm PDT").
 * That string is marketing copy Walmart controls, not a stable API contract, so this is
 * deliberately best-effort: `drawThreadTitle` never throws, it just falls back to echoing the
 * raw text if the format doesn't match what we've seen. Converts to Eastern for the title to
 * match how every other thread in this bot expresses time, even though Walmart's own badge is
 * in Pacific.
 */

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

// Offsets are fixed per abbreviation (PDT vs PST already encodes DST), not computed.
const US_ZONE_OFFSET_HOURS: Record<string, number> = {
  PST: -8,
  PDT: -7,
  MST: -7,
  MDT: -6,
  CST: -6,
  CDT: -5,
  EST: -5,
  EDT: -4,
  AKST: -9,
  AKDT: -8,
  HST: -10,
};

const SLA_TEXT_PATTERN =
  /^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])\s+([A-Za-z]{2,5})$/;

/** Parses a "Mon DD, H:MMam/pm TZ" badge string into an epoch ms instant, or null if unrecognized. */
function parseDrawStart(slaText: string, now: number): number | null {
  const match = slaText.trim().match(SLA_TEXT_PATTERN);
  if (!match) return null;
  const [, monthAbbr, dayStr, hourStr, minuteStr, ampm, tzAbbr] = match;
  const month = MONTHS[monthAbbr.toLowerCase()];
  const offsetHours = US_ZONE_OFFSET_HOURS[tzAbbr.toUpperCase()];
  if (month === undefined || offsetHours === undefined) return null;

  const day = Number(dayStr);
  const minute = Number(minuteStr);
  let hour = Number(hourStr) % 12;
  if (ampm.toLowerCase() === 'pm') hour += 12;

  const nowYear = new Date(now).getUTCFullYear();
  const asUtcMs = (year: number) => Date.UTC(year, month, day, hour, minute) - offsetHours * 60 * 60 * 1000;

  let candidate = asUtcMs(nowYear);
  // A draw date more than 30 days in the past must mean it's actually next year's version of
  // that month/day (e.g. a December draw first polled in early January).
  if (candidate < now - 30 * 24 * 60 * 60 * 1000) {
    candidate = asUtcMs(nowYear + 1);
  }
  return candidate;
}

const TITLE_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: '2-digit',
  day: '2-digit',
});

const TITLE_TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
});

function formatEasternTitle(startMs: number): string {
  const date = new Date(startMs);
  const datePart = (type: string) => TITLE_DATE_FORMAT.formatToParts(date).find((p) => p.type === type)?.value ?? '';
  const timeParts = TITLE_TIME_FORMAT.formatToParts(date);
  const timePart = (type: string) => timeParts.find((p) => p.type === type)?.value ?? '';

  const month = datePart('month');
  const day = datePart('day');
  const hour = timePart('hour');
  const minute = timePart('minute');
  const dayPeriod = timePart('dayPeriod').toUpperCase();
  const zone = timePart('timeZoneName');
  const time = minute === '00' ? `${hour} ${dayPeriod}` : `${hour}:${minute} ${dayPeriod}`;

  return `Walmart Draw ${month}/${day} ${time} ${zone}`;
}

/**
 * Forum-thread title for a draw grouping. Tries to parse+reformat Walmart's badge text into
 * "Walmart Draw MM/DD H AM/PM EST"; if the text doesn't match the expected shape, falls back to
 * echoing it verbatim so posting still works rather than failing the whole poll over a title.
 */
export function drawThreadTitle(slaText: string, now: number = Date.now()): string {
  const startMs = parseDrawStart(slaText, now);
  return startMs === null ? `Walmart Draw: ${slaText}` : formatEasternTitle(startMs);
}
