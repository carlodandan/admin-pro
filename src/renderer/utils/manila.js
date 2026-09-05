/**
 * Asia/Manila date and time for the renderer.
 *
 * The database stores plain `YYYY-MM-DD` dates and `HH:MM:SS` times in Manila
 * local time — never an offset — because that is what `DatabaseService`
 * produced and what `src-tauri/src/manila.rs` still produces. Several screens
 * used to build "today" with `new Date().toISOString().split('T')[0]`, which is
 * the UTC date: between 00:00 and 08:00 Manila that is yesterday, so a kiosk
 * punch or a payroll cutoff filed in the morning landed on the wrong day.
 * Everything that needs a date now comes through here.
 */

const MANILA = 'Asia/Manila';

/** `YYYY-MM-DD` in Manila. Matches `manila::date()` on the Rust side. */
export const manilaDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);

/** `HH:MM:SS`, 24-hour, in Manila. Matches `manila::time()`. */
export const manilaTime = (date = new Date()) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: MANILA,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);

/** `3:07:22 PM` in Manila — the kiosk clock, which ticks once a second. */
export const manilaClock = (date = new Date()) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(date);

/** `{ year, month, day }` in Manila, with `month` 1-based. */
export const manilaParts = (date = new Date()) => {
  const [year, month, day] = manilaDate(date).split('-');
  return { year: Number(year), month: Number(month), day: Number(day) };
};

/** Manila calendar year. */
export const manilaYear = (date = new Date()) => manilaParts(date).year;

/** Manila month, 1-based, as the payroll and attendance queries expect. */
export const manilaMonth = (date = new Date()) => manilaParts(date).month;

/** Manila day of month. */
export const manilaDay = (date = new Date()) => manilaParts(date).day;

/**
 * A stored `YYYY-MM-DD` turned into a `Date` at local noon.
 *
 * `new Date('2026-09-05')` is parsed as UTC midnight, so formatting it in a
 * negative-offset zone reports the 4th. Noon has eleven hours of slack either
 * way, which no real timezone crosses.
 */
export const parseStoredDate = (value) => {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0);
};

/** `Sep 05, 2026` from a stored `YYYY-MM-DD`. Falls back to the raw input. */
export const formatStoredDate = (value, options) => {
  const date = parseStoredDate(value);
  if (!date) return value ?? '—';
  return date.toLocaleDateString(
    'en-US',
    options ?? { year: 'numeric', month: 'short', day: '2-digit' }
  );
};

/** `Mon`, `Tue`, … from a stored `YYYY-MM-DD`. Matches `manila::weekday_short`. */
export const storedWeekdayShort = (value) => {
  const date = parseStoredDate(value);
  return date ? date.toLocaleDateString('en-US', { weekday: 'short' }) : value;
};

/** `3:07 PM` from a stored `HH:MM:SS`. Time-only, so no date arithmetic. */
export const formatStoredTime = (value) => {
  if (!value) return '—';
  const [hour, minute] = String(value).split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${String(minute).padStart(2, '0')} ${suffix}`;
};

/**
 * A stored `YYYY-MM-DD HH:MM:SS` read as the instant it names in Manila.
 *
 * `new Date('2026-09-05 14:03:22')` is parsed as *machine* local time, so the
 * dashboard's "5 mins ago" was only right on a machine set to Manila. The
 * Philippines has been a fixed UTC+8 since 1978, so subtracting the offset and
 * building the date in UTC is exact. Returns `null` on anything unparseable,
 * which callers show as an unknown time rather than `Invalid Date`.
 */
export const parseStoredTimestamp = (value) => {
  if (!value) return null;
  const match = String(value)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
  const time = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 8, // Manila wall clock → UTC
    Number(minute),
    Number(second)
  );
  return Number.isNaN(time) ? null : new Date(time);
};

/**
 * A `created_at`/`updated_at` column formatted as a Manila calendar date.
 *
 * Those columns default to SQLite's `CURRENT_TIMESTAMP`, which is **UTC** — not
 * the Manila wall clock the app's own date and time columns hold. Taking the
 * first ten characters of one, as the department cards used to, reports
 * yesterday for anything created between midnight and 08:00 Manila.
 */
export const formatUtcStoredDate = (value, options) => {
  if (!value) return '—';
  const match = String(value)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return String(value);

  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
  );

  return new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA,
    ...(options ?? { year: 'numeric', month: 'short', day: '2-digit' })
  }).format(date);
};

/** `5 mins ago` from a stored Manila timestamp. `null` when it cannot be read. */
export const relativeFromNow = (value) => {
  const then = parseStoredTimestamp(value);
  if (!then) return null;

  const minutes = Math.floor((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} mins ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
};

/** The `YYYY-MM-DD` `days` days before today in Manila. */
export const manilaDateDaysAgo = (days) => {
  const { year, month, day } = manilaParts();
  return manilaDate(new Date(Date.UTC(year, month - 1, day - days, 12)));
};

/**
 * A stored `YYYY-MM-DD` moved by whole days, as calendar arithmetic.
 *
 * The attendance day picker stepped with `new Date(selected)` — UTC midnight —
 * then `setDate()`, which is a *local* setter, and read the result back out with
 * `toISOString()`. It happened to land on the right day, but only because the
 * two zone errors cancelled; doing the arithmetic in UTC throughout removes the
 * coincidence.
 */
export const shiftStoredDate = (value, days) => {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

/** `Fri, Sep 05` — the header's date chip. */
export const manilaDateLabel = (date = new Date()) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA,
    weekday: 'short',
    month: 'short',
    day: '2-digit'
  }).format(date);
