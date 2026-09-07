/**
 * Dashboard analytics -- everything derived purely from scheduled `blocks`
 * plus the `clients` they point at. The app keeps no action log, so "what got
 * scheduled" is the only history there is; every number here is booked time,
 * not tracked time.
 *
 * All functions are pure and keyed only on their arguments, so the dashboard
 * can wrap the whole lot in a single `useMemo`.
 */

import type { Block, Client, Priority } from "./types";
import { DAY_LABELS, addDays, fromKey, startOfWeek, toKey } from "./date";
import { totalMinutes } from "./layout";
import { PRIORITY_META } from "./colors";

export type RangePreset =
  | "this-week"
  | "this-month"
  | "this-quarter"
  | "this-year"
  | "all"
  | "custom";

export type DashboardFilters = {
  range: RangePreset;
  /** Only read when `range === "custom"`. Inclusive "YYYY-MM-DD" keys. */
  customStart: string;
  customEnd: string;
  clientId: string | "all";
  priority: Priority | "all";
  serviceTag: string | "all";
};

export const DEFAULT_FILTERS: DashboardFilters = {
  range: "this-month",
  customStart: "",
  customEnd: "",
  clientId: "all",
  priority: "all",
  serviceTag: "all",
};

/** Compact hour label for axes and tiles: 90 -> "1.5h", 120 -> "2h". */
export function fmtHrs(minutes: number): string {
  const h = minutes / 60;
  if (h === 0) return "0h";
  return Number.isInteger(h) || h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}

// ---------------------------------------------------------------------------
// Range
// ---------------------------------------------------------------------------

export type DateBounds = { startKey: string; endKey: string } | null;

/** The inclusive date window a filter selects, or `null` for "all time". */
export function rangeBounds(
  filters: DashboardFilters,
  now: Date = new Date()
): DateBounds {
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (filters.range) {
    case "this-week": {
      const start = startOfWeek(now);
      return { startKey: toKey(start), endKey: toKey(addDays(start, 6)) };
    }
    case "this-month":
      return {
        startKey: toKey(new Date(y, m, 1)),
        endKey: toKey(new Date(y, m + 1, 0)),
      };
    case "this-quarter": {
      const qStart = Math.floor(m / 3) * 3;
      return {
        startKey: toKey(new Date(y, qStart, 1)),
        endKey: toKey(new Date(y, qStart + 3, 0)),
      };
    }
    case "this-year":
      return { startKey: `${y}-01-01`, endKey: `${y}-12-31` };
    case "custom": {
      if (!filters.customStart || !filters.customEnd) return null;
      const a = filters.customStart;
      const b = filters.customEnd;
      return a <= b
        ? { startKey: a, endKey: b }
        : { startKey: b, endKey: a };
    }
    case "all":
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export function filterBlocks(
  blocks: Block[],
  clientsById: Map<string, Client>,
  filters: DashboardFilters,
  now: Date = new Date()
): Block[] {
  const bounds = rangeBounds(filters, now);
  return blocks.filter((b) => {
    if (bounds && (b.date < bounds.startKey || b.date > bounds.endKey))
      return false;
    if (filters.clientId !== "all" && b.clientId !== filters.clientId)
      return false;
    if (filters.priority !== "all" && b.priority !== filters.priority)
      return false;
    if (filters.serviceTag !== "all") {
      const client = clientsById.get(b.clientId);
      if (!client || !client.serviceTags.includes(filters.serviceTag))
        return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

export type Totals = {
  minutes: number;
  clientCount: number;
  dayCount: number;
  blockCount: number;
  avgMinutesPerDay: number;
  busiestDay: { date: string; minutes: number } | null;
};

export function totals(blocks: Block[]): Totals {
  const minutes = totalMinutes(blocks);
  const byDay = new Map<string, number>();
  const clientIds = new Set<string>();
  for (const b of blocks) {
    clientIds.add(b.clientId);
    byDay.set(b.date, (byDay.get(b.date) ?? 0) + b.durationMin);
  }
  let busiestDay: { date: string; minutes: number } | null = null;
  for (const [date, mins] of byDay) {
    if (!busiestDay || mins > busiestDay.minutes) busiestDay = { date, minutes: mins };
  }
  const dayCount = byDay.size;
  return {
    minutes,
    clientCount: clientIds.size,
    dayCount,
    blockCount: blocks.length,
    avgMinutesPerDay: dayCount ? minutes / dayCount : 0,
    busiestDay,
  };
}

export type TimeBucket = { label: string; minutes: number };

/** Days spanned by a bounds window, or by the data when the range is "all". */
function spanDays(bounds: DateBounds, blocks: Block[]): {
  start: Date;
  end: Date;
} | null {
  if (bounds) return { start: fromKey(bounds.startKey), end: fromKey(bounds.endKey) };
  if (blocks.length === 0) return null;
  let min = blocks[0].date;
  let max = blocks[0].date;
  for (const b of blocks) {
    if (b.date < min) min = b.date;
    if (b.date > max) max = b.date;
  }
  return { start: fromKey(min), end: fromKey(max) };
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type Granularity = "day" | "week" | "month";

export function hoursOverTime(
  blocks: Block[],
  bounds: DateBounds
): { buckets: TimeBucket[]; granularity: Granularity } {
  const span = spanDays(bounds, blocks);
  if (!span) return { buckets: [], granularity: "day" };

  const totalDays =
    Math.round((span.end.getTime() - span.start.getTime()) / 86_400_000) + 1;
  const granularity: Granularity =
    totalDays <= 31 ? "day" : totalDays <= 182 ? "week" : "month";

  // Sum minutes into keyed buckets first.
  const sums = new Map<string, number>();
  for (const b of blocks) {
    const key = bucketKey(fromKey(b.date), granularity);
    sums.set(key, (sums.get(key) ?? 0) + b.durationMin);
  }

  // Then walk the whole span so empty buckets still show.
  const buckets: TimeBucket[] = [];
  const seen = new Set<string>();
  const cursor = new Date(span.start);
  // Guard against pathological spans.
  for (let i = 0; i < 400 && cursor <= span.end; i++) {
    const key = bucketKey(cursor, granularity);
    if (!seen.has(key)) {
      seen.add(key);
      buckets.push({ label: bucketLabel(cursor, granularity), minutes: sums.get(key) ?? 0 });
    }
    if (granularity === "day") cursor.setDate(cursor.getDate() + 1);
    else if (granularity === "week") cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  return { buckets, granularity };
}

function bucketKey(d: Date, g: Granularity): string {
  if (g === "day") return toKey(d);
  if (g === "week") return toKey(startOfWeek(d));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function bucketLabel(d: Date, g: Granularity): string {
  if (g === "day") return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
  if (g === "week") {
    const s = startOfWeek(d);
    return `${MONTH_ABBR[s.getMonth()]} ${s.getDate()}`;
  }
  return `${MONTH_ABBR[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

export type ClientSlice = {
  id: string;
  name: string;
  color: string;
  minutes: number;
  blockCount: number;
};

const OTHER_ID = "__other__";

export function topClients(
  blocks: Block[],
  clientsById: Map<string, Client>,
  colorOf: (c: Client) => string,
  otherColor: string,
  limit = 8
): ClientSlice[] {
  const agg = new Map<string, { minutes: number; blockCount: number }>();
  for (const b of blocks) {
    const cur = agg.get(b.clientId) ?? { minutes: 0, blockCount: 0 };
    cur.minutes += b.durationMin;
    cur.blockCount += 1;
    agg.set(b.clientId, cur);
  }

  const rows: ClientSlice[] = [];
  for (const [id, { minutes, blockCount }] of agg) {
    const client = clientsById.get(id);
    rows.push({
      id,
      name: client?.name ?? "Unknown",
      color: client ? colorOf(client) : otherColor,
      minutes,
      blockCount,
    });
  }
  rows.sort((a, b) => b.minutes - a.minutes);

  if (rows.length <= limit) return rows;
  const head = rows.slice(0, limit);
  const tail = rows.slice(limit);
  head.push({
    id: OTHER_ID,
    name: `Other (${tail.length})`,
    color: otherColor,
    minutes: tail.reduce((s, r) => s + r.minutes, 0),
    blockCount: tail.reduce((s, r) => s + r.blockCount, 0),
  });
  return head;
}

export type PrioritySlice = { priority: Priority; label: string; minutes: number };

export function priorityMix(blocks: Block[]): PrioritySlice[] {
  const order: Priority[] = ["high", "normal", "low"];
  const sums = new Map<Priority, number>();
  for (const b of blocks) sums.set(b.priority, (sums.get(b.priority) ?? 0) + b.durationMin);
  return order
    .map((p) => ({ priority: p, label: PRIORITY_META[p].label, minutes: sums.get(p) ?? 0 }))
    .filter((s) => s.minutes > 0);
}

export type WeekdaySlice = { weekday: number; label: string; minutes: number };

export function weekdayLoad(blocks: Block[]): WeekdaySlice[] {
  const sums = new Array(7).fill(0);
  for (const b of blocks) {
    // getDay(): 0=Sun..6=Sat -> shift so Monday is 0, matching DAY_LABELS.
    const idx = (fromKey(b.date).getDay() + 6) % 7;
    sums[idx] += b.durationMin;
  }
  return DAY_LABELS.map((label, i) => ({ weekday: i, label, minutes: sums[i] }));
}

export type ServiceSlice = { tag: string; minutes: number };

export function serviceMix(
  blocks: Block[],
  clientsById: Map<string, Client>
): ServiceSlice[] {
  const sums = new Map<string, number>();
  for (const b of blocks) {
    const client = clientsById.get(b.clientId);
    if (!client) continue;
    const tags = client.serviceTags.length ? client.serviceTags : ["Untagged"];
    for (const t of tags) sums.set(t, (sums.get(t) ?? 0) + b.durationMin);
  }
  return [...sums.entries()]
    .map(([tag, minutes]) => ({ tag, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}
