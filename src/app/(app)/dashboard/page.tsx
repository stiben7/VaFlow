"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { chartColorFor, PRIORITY_META } from "@/lib/colors";
import { fromKey, formatDayLong } from "@/lib/date";
import type { Client } from "@/lib/types";
import {
  DEFAULT_FILTERS,
  fmtHrs,
  filterBlocks,
  hoursOverTime,
  priorityMix,
  rangeBounds,
  serviceMix,
  topClients,
  totals,
  weekdayLoad,
  type DashboardFilters,
  type RangePreset,
} from "@/lib/analytics";
import { Bars, Donut } from "@/components/charts";
import Select from "@/components/Select";

const RANGE_LABELS: Record<RangePreset, string> = {
  "this-week": "This week",
  "this-month": "This month",
  "this-quarter": "This quarter",
  "this-year": "This year",
  all: "All time",
  custom: "Custom range",
};

const PRIORITY_HEX: Record<string, string> = {
  High: "#ef4444",
  Medium: "#facc15",
  Low: "#22c55e",
};

const dateInputCls =
  "rounded-md border border-edge bg-canvas px-2.5 py-1.5 text-[12.5px] text-ink outline-none transition-colors hover:border-faint focus:border-brand focus:ring-2 focus:ring-brand/15";

export default function DashboardPage() {
  const { clients, blocks, ready, serviceTags } = useStore();
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);

  const set = <K extends keyof DashboardFilters>(
    key: K,
    value: DashboardFilters[K]
  ) => setFilters((f) => ({ ...f, [key]: value }));

  const view = useMemo(() => {
    const byId = new Map<string, Client>(clients.map((c) => [c.id, c]));
    const bounds = rangeBounds(filters);
    const rows = filterBlocks(blocks, byId, filters);
    return {
      bounds,
      rows,
      totals: totals(rows),
      overTime: hoursOverTime(rows, bounds),
      clientsRanked: topClients(
        rows,
        byId,
        (c) => chartColorFor(c),
        "var(--color-faint)"
      ),
      priority: priorityMix(rows),
      weekday: weekdayLoad(rows),
      services: serviceMix(rows, byId),
    };
  }, [clients, blocks, filters]);

  const rangeSubtitle = useMemo(() => {
    if (filters.range !== "custom") return RANGE_LABELS[filters.range];
    if (view.bounds)
      return `${view.bounds.startKey} to ${view.bounds.endKey}`;
    return "Pick a start and end date";
  }, [filters.range, view.bounds]);

  const empty = ready && view.rows.length === 0;

  const activeClients = clients
    .filter((c) => !c.archived)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <header className="flex shrink-0 flex-col gap-0.5 border-b border-edge bg-canvas px-5 py-3">
        <h1 className="text-[15px] font-semibold tracking-tight text-ink">
          Dashboard
        </h1>
        <p className="text-[11px] text-faint">
          {ready ? `Scheduled work · ${rangeSubtitle}` : "Loading…"}
        </p>
      </header>

      {/* Filters */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-edge bg-panel px-5 py-2.5">
        <Select
          value={filters.range}
          onChange={(e) => set("range", e.target.value as RangePreset)}
          aria-label="Date range"
        >
          {(Object.keys(RANGE_LABELS) as RangePreset[]).map((r) => (
            <option key={r} value={r}>
              {RANGE_LABELS[r]}
            </option>
          ))}
        </Select>

        {filters.range === "custom" && (
          <>
            <input
              type="date"
              value={filters.customStart}
              onChange={(e) => set("customStart", e.target.value)}
              className={dateInputCls}
              aria-label="Start date"
            />
            <span className="text-[12px] text-faint">to</span>
            <input
              type="date"
              value={filters.customEnd}
              onChange={(e) => set("customEnd", e.target.value)}
              className={dateInputCls}
              aria-label="End date"
            />
          </>
        )}

        <Select
          value={filters.clientId}
          onChange={(e) => set("clientId", e.target.value)}
          aria-label="Client"
        >
          <option value="all">All clients</option>
          {activeClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        <Select
          value={filters.priority}
          onChange={(e) =>
            set("priority", e.target.value as DashboardFilters["priority"])
          }
          aria-label="Priority"
        >
          <option value="all">Any priority</option>
          <option value="high">{PRIORITY_META.high.label}</option>
          <option value="normal">{PRIORITY_META.normal.label}</option>
          <option value="low">{PRIORITY_META.low.label}</option>
        </Select>

        <Select
          value={filters.serviceTag}
          onChange={(e) => set("serviceTag", e.target.value)}
          aria-label="Service tag"
        >
          <option value="all">Any service</option>
          {serviceTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>

        {(filters.range !== DEFAULT_FILTERS.range ||
          filters.clientId !== "all" ||
          filters.priority !== "all" ||
          filters.serviceTag !== "all") && (
          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-sunken hover:text-ink"
          >
            Reset
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {!ready ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-56 animate-pulse rounded-lg bg-sunken" />
            ))}
          </div>
        ) : empty ? (
          <div className="py-20 text-center">
            <p className="text-[13px] text-muted">
              No scheduled time in this range.
            </p>
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="mt-2 text-[12.5px] font-medium text-brand hover:underline"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-4">
            {/* Stat tiles */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Total hours" value={fmtHrs(view.totals.minutes)} />
              <Stat label="Clients" value={String(view.totals.clientCount)} />
              <Stat label="Days worked" value={String(view.totals.dayCount)} />
              <Stat
                label="Avg / day"
                value={fmtHrs(view.totals.avgMinutesPerDay)}
              />
              <Stat
                label="Busiest day"
                value={
                  view.totals.busiestDay
                    ? fmtHrs(view.totals.busiestDay.minutes)
                    : "—"
                }
                sub={
                  view.totals.busiestDay
                    ? formatDayLong(fromKey(view.totals.busiestDay.date)).replace(
                        /,\s\d{4}$/,
                        ""
                      )
                    : undefined
                }
              />
            </div>

            {/* Charts */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card
                className="lg:col-span-2"
                title="Hours over time"
                hint={`Bucketed by ${view.overTime.granularity}`}
              >
                <Bars
                  data={view.overTime.buckets.map((b) => ({
                    label: b.label,
                    value: b.minutes,
                  }))}
                  height={220}
                />
              </Card>

              <Card title="Top clients" hint="By booked hours">
                <Bars
                  direction="row"
                  data={view.clientsRanked.map((c) => ({
                    id: c.id,
                    label: c.name,
                    value: c.minutes,
                    color: c.color,
                  }))}
                  height={Math.max(160, view.clientsRanked.length * 34)}
                />
              </Card>

              {view.priority.length > 0 && (
                <Card title="Priority mix" hint="Share of booked hours">
                  <Donut
                    segments={view.priority.map((p) => ({
                      label: p.label,
                      value: p.minutes,
                      color: PRIORITY_HEX[p.label] ?? "var(--color-faint)",
                    }))}
                  />
                </Card>
              )}

              <Card title="Busiest weekday" hint="Total booked hours by day">
                <Bars
                  data={view.weekday.map((d) => ({
                    label: d.label,
                    value: d.minutes,
                  }))}
                  height={200}
                />
              </Card>

              {view.services.length > 0 && (
                <Card
                  className="lg:col-span-2"
                  title="Service mix"
                  hint="Hours counted once per service tag on the client"
                >
                  <Bars
                    direction="row"
                    data={view.services.map((s) => ({
                      label: s.tag,
                      value: s.minutes,
                    }))}
                    height={Math.max(140, view.services.length * 34)}
                  />
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-edge bg-canvas p-3">
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-faint">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums leading-none text-ink">
        {value}
      </div>
      {sub && <div className="mt-1 truncate text-[10.5px] text-faint">{sub}</div>}
    </div>
  );
}

function Card({
  title,
  hint,
  className = "",
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-lg border border-edge bg-canvas p-4 ${className}`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        {hint && <span className="text-[10.5px] text-faint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
