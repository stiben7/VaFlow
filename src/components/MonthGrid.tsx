"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useDrag, type Hit } from "@/lib/drag";
import { accentFor } from "@/lib/colors";
import { totalMinutes } from "@/lib/layout";
import type { Block } from "@/lib/types";
import {
  DAY_LABELS,
  formatDuration,
  formatTime,
  isToday,
  isWeekend,
  toKey,
} from "@/lib/date";
import BlockDetail from "./BlockDetail";

/** Chips shown per cell before collapsing into a "+N more" row. */
const MAX_VISIBLE = 3;

export default function MonthGrid({
  days,
  anchorMonth,
}: {
  /** Exactly 42 days: the 6x7 grid covering the month. */
  days: Date[];
  anchorMonth: number;
}) {
  const { blocks, clientById, editBlock } = useStore();
  const { registerSurface, startBlockMove, drag } = useDrag();

  const gridRef = useRef<HTMLDivElement>(null);
  const daysRef = useRef(days);
  daysRef.current = days;

  const [openId, setOpenId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const hitTest = useCallback((x: number, y: number): Hit | null => {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      return null;
    }
    const col = Math.min(6, Math.floor(((x - rect.left) / rect.width) * 7));
    const row = Math.min(5, Math.floor(((y - rect.top) / rect.height) * 6));
    const idx = row * 7 + col;
    const d = daysRef.current[idx];
    if (!d) return null;
    return { date: toKey(d), rawMin: 0, granularity: "day" };
  }, []);

  useEffect(() => {
    registerSurface({ hitTest, scrollEl: null });
    return () => registerSurface(null);
  }, [registerSurface, hitTest]);

  const byDate = useMemo(() => {
    const m = new Map<string, Block[]>();
    for (const d of days) m.set(toKey(d), []);
    for (const b of blocks) m.get(b.date)?.push(b);
    for (const list of m.values()) list.sort((a, b) => a.startMin - b.startMin);
    return m;
  }, [blocks, days]);

  const preview = drag?.active ? drag.preview : null;
  const movingId =
    drag?.active && drag.payload.kind === "move" ? drag.payload.block.id : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* weekday header */}
      <div className="grid shrink-0 grid-cols-7 border-b border-edge bg-canvas">
        {DAY_LABELS.map((l) => (
          <div
            key={l}
            className="border-l border-edge py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wide text-faint first:border-l-0"
          >
            {l}
          </div>
        ))}
      </div>

      <div
        ref={gridRef}
        className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-hidden"
      >
        {days.map((d) => {
          const key = toKey(d);
          const dayBlocks = byDate.get(key) ?? [];
          const outside = d.getMonth() !== anchorMonth;
          const today = isToday(d);
          const isOpen = expanded === key;
          const visible = isOpen ? dayBlocks : dayBlocks.slice(0, MAX_VISIBLE);
          const hidden = dayBlocks.length - visible.length;
          const isTarget = preview?.date === key;

          return (
            <div
              key={key}
              className={`flex min-h-0 flex-col overflow-hidden border-b border-l border-edge px-1 pb-1 pt-1 transition-colors ${
                outside ? "bg-panel/70" : isWeekend(d) ? "bg-panel/40" : ""
              } ${isTarget ? "bg-brand-soft ring-1 ring-inset ring-brand" : ""}`}
            >
              <div className="flex shrink-0 items-center gap-1 px-0.5">
                <span
                  className={`grid h-[19px] min-w-[19px] place-items-center rounded-full px-1 text-[11px] font-semibold tabular-nums ${
                    today
                      ? "bg-brand text-white"
                      : outside
                        ? "text-faint"
                        : "text-ink"
                  }`}
                >
                  {d.getDate()}
                </span>
                {dayBlocks.length > 0 && (
                  <span className="ml-auto text-[9.5px] font-medium tabular-nums text-faint">
                    {formatDuration(totalMinutes(dayBlocks))}
                  </span>
                )}
              </div>

              <div className="mt-0.5 min-h-0 flex-1 space-y-[2px] overflow-y-auto">
                {visible.map((b) => {
                  const c = clientById(b.clientId);
                  if (!c) return null;
                  const accent = accentFor(c);
                  return (
                    <div
                      key={b.id}
                      data-block-id={b.id}
                      onPointerDown={(e) =>
                        startBlockMove(
                          e,
                          b,
                          0,
                          (p) => void editBlock(b.id, { date: p.date }),
                          () =>
                            setOpenId((cur) => (cur === b.id ? null : b.id))
                        )
                      }
                      title={`${c.name} at ${formatTime(b.startMin)}`}
                      style={accent.style}
                      className={`no-touch-scroll flex cursor-grab items-center gap-1 overflow-hidden rounded border px-1 py-[2px] active:cursor-grabbing ${accent.chip} ${
                        movingId === b.id ? "opacity-30" : "hover:brightness-95"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent.dot}`}
                      />
                      <span
                        className={`truncate text-[10px] font-medium leading-tight ${accent.text}`}
                      >
                        {c.name}
                      </span>
                    </div>
                  );
                })}

                {hidden > 0 && (
                  <button
                    onClick={() => setExpanded(key)}
                    className="w-full rounded px-1 py-[1px] text-left text-[9.5px] font-medium text-muted hover:bg-sunken hover:text-ink"
                  >
                    +{hidden} more
                  </button>
                )}
                {isOpen && dayBlocks.length > MAX_VISIBLE && (
                  <button
                    onClick={() => setExpanded(null)}
                    className="w-full rounded px-1 py-[1px] text-left text-[9.5px] font-medium text-muted hover:bg-sunken hover:text-ink"
                  >
                    Show less
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {openId && (
        <BlockDetail blockId={openId} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}
