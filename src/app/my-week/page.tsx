"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import type { CalendarView } from "@/lib/types";
import {
  addDays,
  addMonths,
  monthGridDays,
  toKey,
  weekDays,
} from "@/lib/date";
import CalendarToolbar from "@/components/CalendarToolbar";
import ClientPool from "@/components/ClientPool";
import TimeGrid from "@/components/TimeGrid";
import MonthGrid from "@/components/MonthGrid";
import DragGhost from "@/components/DragGhost";

export default function MyWeekPage() {
  const { blocks, ready, notice, mode } = useStore();
  const [view, setView] = useState<CalendarView>("week");

  // Resolved on the client only. Deriving "today" during SSR would pick the
  // server's timezone and produce a hydration mismatch on the highlighted day.
  const [anchor, setAnchor] = useState<Date | null>(null);
  useEffect(() => setAnchor(new Date()), []);

  const step = useCallback(
    (dir: 1 | -1) => {
      setAnchor((cur) => {
        if (!cur) return cur;
        if (view === "day") return addDays(cur, dir);
        if (view === "week") return addDays(cur, dir * 7);
        return addMonths(cur, dir);
      });
    },
    [view]
  );

  // Keyboard: D/W/M switch views, T jumps home, arrows page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const k = e.key.toLowerCase();
      if (k === "d") setView("day");
      else if (k === "w") setView("week");
      else if (k === "m") setView("month");
      else if (k === "t") setAnchor(new Date());
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const days = useMemo(() => {
    if (!anchor) return [];
    if (view === "day") return [anchor];
    if (view === "week") return weekDays(anchor);
    return monthGridDays(anchor);
  }, [anchor, view]);

  const visibleDates = useMemo(() => days.map(toKey), [days]);

  if (!anchor) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-edge border-t-brand" />
      </div>
    );
  }

  return (
    <>
      <CalendarToolbar
        anchor={anchor}
        view={view}
        onView={setView}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onToday={() => setAnchor(new Date())}
      />

      {notice && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[11.5px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          {notice}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <ClientPool visibleDates={visibleDates} />

        <section className="relative flex min-w-0 flex-1 flex-col">
          {view === "month" ? (
            <MonthGrid days={days} anchorMonth={anchor.getMonth()} />
          ) : (
            <TimeGrid days={days} />
          )}

          {/* First-run hint. Disappears the moment anything is scheduled. */}
          {ready && blocks.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 z-40 flex justify-center px-6">
              <div className="max-w-md rounded-xl border border-edge bg-canvas/95 px-5 py-3.5 text-center shadow-xl backdrop-blur">
                <p className="text-[13px] font-semibold text-ink">
                  Nothing on the calendar yet
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  Drag an account from the roster on the left onto a day. Drop it
                  where you actually intend to work on it -- the point is to see
                  what fits, not to fit everything.
                </p>
                <p className="mt-2.5 text-[11px] text-faint">
                  <kbd className={kbd}>D</kbd> <kbd className={kbd}>W</kbd>{" "}
                  <kbd className={kbd}>M</kbd> switch views &middot;{" "}
                  <kbd className={kbd}>T</kbd> today
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <DragGhost />

      {/* Quiet footer note so it is always obvious where data is living. */}
      <div className="shrink-0 border-t border-edge bg-panel px-4 py-1 text-[10.5px] text-faint">
        {mode === "api"
          ? "Connected to Postgres."
          : "Local mode -- schedule is saved in this browser. Set DATABASE_URL and NEXT_PUBLIC_DATA_MODE=api to sync."}
      </div>
    </>
  );
}

const kbd =
  "rounded border border-edge bg-sunken px-1 py-px font-sans text-[10px] font-medium text-muted";
