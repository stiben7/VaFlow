"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/config";
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
import { CloseIcon } from "@/components/Icons";

export default function MyWeekPage() {
  const { blocks, clients, ready, error, dismissError, mode } = useStore();

  // A data-layer error auto-expires -- a stale banner over a working app is
  // worse than none. It also clears itself the next time a write succeeds.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(dismissError, 8000);
    return () => clearTimeout(t);
  }, [error, dismissError]);
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

      {error && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[11.5px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <span className="min-w-0 flex-1">{error}</span>
          <button
            onClick={dismissError}
            aria-label="Dismiss"
            className="shrink-0 rounded p-0.5 text-amber-900/70 hover:bg-amber-900/10 hover:text-amber-900 dark:text-amber-200/70 dark:hover:text-amber-200"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
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

          {/* First-run hint. Only once there is actually a roster to drag from,
              and gone the moment anything is scheduled. */}
          {ready && clients.length > 0 && blocks.length === 0 && (
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
                  <kbd className={kbd}>T</kbd> today &middot; click a block then{" "}
                  <kbd className={kbd}>Ctrl+D</kbd> dup &middot;{" "}
                  <kbd className={kbd}>Del</kbd> remove
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <DragGhost />

      {/* Quiet footer note so it is always obvious where data is living. */}
      <div className="shrink-0 border-t border-edge bg-panel px-4 py-1 text-[10.5px] text-faint">
        {mode === "cloud"
          ? "Synced to your account. Private to you."
          : isSupabaseConfigured
            ? "Guest mode -- saved in this browser only. Sign in to sync to an account."
            : "Local mode -- saved in this browser only. Add the Supabase env vars to enable accounts."}
      </div>
    </>
  );
}

const kbd =
  "rounded border border-edge bg-sunken px-1 py-px font-sans text-[10px] font-medium text-muted";
