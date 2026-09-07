/**
 * All calendar maths runs on *local* dates keyed by "YYYY-MM-DD".
 *
 * Deliberately no UTC timestamps anywhere: a block dropped on Monday 9am must
 * stay on Monday 9am regardless of where the VA is sitting or whether the
 * server is in another timezone. The date string is the source of truth.
 */

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

export function addMonths(d: Date, n: number): Date {
  const next = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(d.getDate(), lastDay));
  return next;
}

/** Monday of the week containing `d`. Weeks run Monday -> Sunday. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // getDay(): 0=Sun .. 6=Sat. Shift so Monday is 0.
  const offset = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - offset);
  return out;
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** The 6x7 grid covering the month containing `anchor`, padded to whole weeks. */
export function monthGridDays(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function isSameDay(a: Date, b: Date): boolean {
  return toKey(a) === toKey(b);
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/** 0 -> "12 AM", 540 -> "9 AM", 810 -> "1:30 PM" */
export function formatTime(minutes: number, opts: { compact?: boolean } = {}): string {
  const total = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  if (opts.compact && m === 0) return `${h12} ${suffix}`;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "Sep 1 to 7, 2026" / "Aug 31 to Sep 6, 2026" */
export function formatWeekRange(anchor: Date): string {
  const days = weekDays(anchor);
  const a = days[0];
  const b = days[6];
  const mA = MONTH_LABELS[a.getMonth()].slice(0, 3);
  const mB = MONTH_LABELS[b.getMonth()].slice(0, 3);
  if (a.getMonth() === b.getMonth()) {
    return `${mA} ${a.getDate()} to ${b.getDate()}, ${b.getFullYear()}`;
  }
  if (a.getFullYear() === b.getFullYear()) {
    return `${mA} ${a.getDate()} to ${mB} ${b.getDate()}, ${b.getFullYear()}`;
  }
  return `${mA} ${a.getDate()}, ${a.getFullYear()} to ${mB} ${b.getDate()}, ${b.getFullYear()}`;
}

export function formatDayLong(d: Date): string {
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
  return `${weekday}, ${MONTH_LABELS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatMonthLong(d: Date): string {
  return `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Snap a minute value to the nearest `step` (default 15). */
export function snap(minutes: number, step = 15): number {
  return Math.round(minutes / step) * step;
}
