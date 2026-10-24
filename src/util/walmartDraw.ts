/**
 * Parsing/formatting for Walmart's draw-related badge text (e.g. "Oct 07, 2:00pm PDT"). That
 * string is marketing copy Walmart controls, not a stable API contract, so this is deliberately
 * best-effort: nothing here throws, it just falls back to echoing the raw text if the format
 * doesn't match what we've seen. Converts to Eastern for thread titles to match how every other
 * thread in this bot expresses time, even though Walmart's own badge is in Pacific.
 *
 * Walmart reuses the same badge slot for two different phases of one drawing, with different
 * wording *and* a different instant: "Drawing entry window" + a start(-end) time before the draw,
 * then "Drawing results by" + a single deadline time once it's running. `extractDrawDateKey`
 * exists because of that: the raw text can't be used as a stable identity for one drawing since
 * it changes mid-event, but the calendar date usually doesn't.
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

// Walmart sometimes gives a single time ("2:00pm PDT") and sometimes a window
// ("2:00pm - 3:00pm PDT") — the trailing end time, if present, is ignored; only the start matters.
const ABSOLUTE_SLA_PATTERN =
  /^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])(?:\s*-\s*\d{1,2}:\d{2}\s*[AaPp][Mm])?\s+([A-Za-z]{2,5})$/;

// The relative shape Walmart's badge switches to once a drawing is close/active, in place of a
// month/day — same time(-range) + zone suffix otherwise.
const RELATIVE_SLA_PATTERN =
  /^(Today|Tomorrow)\s*,?\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])(?:\s*-\s*\d{1,2}:\d{2}\s*[AaPp][Mm])?\s+([A-Za-z]{2,5})$/i;

function to24Hour(hourStr: string, ampm: string): number {
  let hour = Number(hourStr) % 12;
  if (ampm.toLowerCase() === 'pm') hour += 12;
  return hour;
}

/** The (year, month, day) a UTC instant falls on in a zone at a fixed offset (per US_ZONE_OFFSET_HOURS). */
function zonedDateParts(ms: number, offsetHours: number): { year: number; month: number; day: number } {
  const local = new Date(ms + offsetHours * 60 * 60 * 1000);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth(), day: local.getUTCDate() };
}

/** Parses a "Mon DD, H:MMam/pm TZ" badge string into an epoch ms instant, or null if unrecognized. */
function parseAbsoluteDrawInstant(slaText: string, now: number): number | null {
  const match = slaText.match(ABSOLUTE_SLA_PATTERN);
  if (!match) return null;
  const [, monthAbbr, dayStr, hourStr, minuteStr, ampm, tzAbbr] = match;
  const month = MONTHS[monthAbbr.toLowerCase()];
  const offsetHours = US_ZONE_OFFSET_HOURS[tzAbbr.toUpperCase()];
  if (month === undefined || offsetHours === undefined) return null;

  const day = Number(dayStr);
  const minute = Number(minuteStr);
  const hour = to24Hour(hourStr, ampm);

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

/**
 * Parses a "Today"/"Tomorrow, H:MMam/pm TZ" badge string into an epoch ms instant, or null if
 * unrecognized. "Today"/"Tomorrow" is resolved against the zone named in the badge, not the poll
 * server's own clock — the badge's zone is what Walmart means by "today" here.
 */
function parseRelativeDrawInstant(slaText: string, now: number): number | null {
  const match = slaText.match(RELATIVE_SLA_PATTERN);
  if (!match) return null;
  const [, dayWord, hourStr, minuteStr, ampm, tzAbbr] = match;
  const offsetHours = US_ZONE_OFFSET_HOURS[tzAbbr.toUpperCase()];
  if (offsetHours === undefined) return null;

  const { year, month, day } = zonedDateParts(now, offsetHours);
  const dayOffset = dayWord.toLowerCase() === 'tomorrow' ? 1 : 0;
  const minute = Number(minuteStr);
  const hour = to24Hour(hourStr, ampm);
  return Date.UTC(year, month, day + dayOffset, hour, minute) - offsetHours * 60 * 60 * 1000;
}

/** Parses either badge shape into an epoch ms instant, or null if neither matches. */
function parseDrawInstant(slaText: string, now: number): number | null {
  const text = slaText.trim();
  return parseAbsoluteDrawInstant(text, now) ?? parseRelativeDrawInstant(text, now);
}

const DRAW_DATE_KEY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Resolves a badge string to the calendar date (Pacific, "YYYY-MM-DD") its drawing falls on, or
 * null if the text doesn't match a known shape. Use this as the dedup/grouping key instead of
 * the raw badge text — see the file header for why. Pacific rather than Eastern because that's
 * the zone actually printed on the badge; Eastern is only this bot's display preference for the
 * thread title.
 */
export function extractDrawDateKey(slaText: string, now: number = Date.now()): string | null {
  const instant = parseDrawInstant(slaText, now);
  return instant === null ? null : DRAW_DATE_KEY_FORMAT.format(instant);
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
  const startMs = parseDrawInstant(slaText, now);
  return startMs === null ? `Walmart Draw: ${slaText}` : formatEasternTitle(startMs);
}
