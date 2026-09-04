"use client";

import type { CalendarView } from "@/lib/types";
import { ChevronLeft, ChevronRight } from "./Icons";
import {
  formatDayLong,
  formatMonthLong,
  formatWeekRange,
  isToday,
} from "@/lib/date";

const VIEWS: { id: CalendarView; label: string; key: string }[] = [
  { id: "day", label: "Day", key: "D" },
  { id: "week", label: "Week", key: "W" },
  { id: "month", label: "Month", key: "M" },
];

export default function CalendarToolbar({
  anchor,
  view,
  onView,
  onPrev,
  onNext,
  onToday,
}: {
  anchor: Date;
  view: CalendarView;
  onView: (v: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const title =
    view === "day"
      ? formatDayLong(anchor)
      : view === "week"
        ? formatWeekRange(anchor)
        : formatMonthLong(anchor);

  const atToday = view === "day" && isToday(anchor);

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-edge bg-canvas px-4 py-2.5">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight text-ink">
          My Week
        </h1>
        <p className="text-[11px] text-faint">
          Give every account a place before the week decides for you.
        </p>
      </div>

      <div className="ml-4 flex items-center gap-1">
        <button
          onClick={onPrev}
          aria-label="Previous"
          className="rounded-md p-1.5 text-muted hover:bg-sunken hover:text-ink"
        >
          <ChevronLeft />
        </button>
        <button
          onClick={onToday}
          disabled={atToday}
          className="rounded-md border border-edge px-2.5 py-1 text-[12px] font-medium text-ink transition-colors hover:bg-sunken disabled:opacity-40"
        >
          Today
        </button>
        <button
          onClick={onNext}
          aria-label="Next"
          className="rounded-md p-1.5 text-muted hover:bg-sunken hover:text-ink"
        >
          <ChevronRight />
        </button>
      </div>

      <div className="text-[13px] font-medium tabular-nums text-ink">{title}</div>

      {/* View switcher */}
      <div className="ml-auto flex items-center gap-0.5 rounded-lg bg-sunken p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => onView(v.id)}
            title={`${v.label} view (${v.key})`}
            className={`rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-all ${
              view === v.id
                ? "bg-canvas text-ink shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
    </header>
  );
}
