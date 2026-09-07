"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useDrag, type Hit } from "@/lib/drag";
import { accentFor, PRIORITY_META } from "@/lib/colors";
import { layoutDay, totalMinutes } from "@/lib/layout";
import { isTextEntryTarget } from "@/lib/dom";
import type { Block } from "@/lib/types";
import {
  DAY_LABELS,
  clamp,
  formatDuration,
  formatTime,
  isToday,
  isWeekend,
  toKey,
} from "@/lib/date";
import BlockDetail from "./BlockDetail";

const HOUR_H = 52;
const GUTTER_W = 58;
const DAY_H = HOUR_H * 24;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ---- resizable day columns -----------------------------------------------
// Widths are remembered per column count (1 for day view, 7 for week) so the
// layout survives navigation and reloads, the way a spreadsheet keeps the
// widths you set.
const COLW_KEY = "vaflow.colWidths.v1";
const MIN_COL = 88;

function readColMap(): Record<string, number[]> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(COLW_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function loadColWidths(count: number): number[] | null {
  const arr = readColMap()[String(count)];
  return Array.isArray(arr) &&
    arr.length === count &&
    arr.every((n) => typeof n === "number" && n >= MIN_COL)
    ? arr
    : null;
}

function saveColWidths(count: number, widths: number[]): void {
  if (typeof window === "undefined") return;
  try {
    const map = readColMap();
    map[String(count)] = widths;
    window.localStorage.setItem(COLW_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode -- not worth interrupting over */
  }
}

function clearColWidths(count: number): void {
  if (typeof window === "undefined") return;
  try {
    const map = readColMap();
    delete map[String(count)];
    window.localStorage.setItem(COLW_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

type ClipboardData = {
  clientId: string;
  durationMin: number;
  priority: Block["priority"];
  note: string | null;
};

export default function TimeGrid({ days }: { days: Date[] }) {
  const { blocks, clientById, editBlock, addBlock, removeBlock } = useStore();
  const { registerSurface, startBlockMove, startBlockResize, drag } = useDrag();

  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const headerColsRef = useRef<HTMLDivElement>(null);
  const daysRef = useRef(days);
  daysRef.current = days;

  // ---- column widths ---------------------------------------------------
  const colCount = days.length;
  const [colWidths, setColWidths] = useState<number[] | null>(null);
  // Read from localStorage after mount (and whenever the column count
  // changes), so SSR and the first client render agree.
  useEffect(() => {
    setColWidths(loadColWidths(colCount));
  }, [colCount]);

  const colTemplate = colWidths
    ? colWidths.map((w) => `${w}px`).join(" ")
    : `repeat(${colCount}, minmax(0, 1fr))`;
  const contentWidth = colWidths
    ? GUTTER_W + colWidths.reduce((a, b) => a + b, 0)
    : undefined;

  const measureCols = useCallback((): number[] => {
    const el = headerColsRef.current;
    if (el && el.children.length === colCount) {
      return Array.from(el.children).map((c) =>
        Math.round((c as HTMLElement).getBoundingClientRect().width)
      );
    }
    const total = el?.getBoundingClientRect().width ?? colCount * 140;
    return Array.from({ length: colCount }, () =>
      Math.max(MIN_COL, Math.round(total / colCount))
    );
  }, [colCount]);

  const startColResize = useCallback(
    (e: React.PointerEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      const base = (colWidths ?? measureCols()).slice();
      const startX = e.clientX;
      const startW = base[index];
      const onMove = (ev: PointerEvent) => {
        const next = base.slice();
        next[index] = Math.max(
          MIN_COL,
          Math.round(startW + (ev.clientX - startX))
        );
        setColWidths(next);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        setColWidths((cur) => {
          if (cur) saveColWidths(colCount, cur);
          return cur;
        });
      };
      document.body.style.cursor = "col-resize";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [colWidths, measureCols, colCount]
  );

  const resetColWidths = useCallback(() => {
    setColWidths(null);
    clearColWidths(colCount);
  }, [colCount]);

  // Multi-select. `openId` (the anchored detail card) is just "exactly one
  // block selected" -- clicking a chip, or a marquee that lands on a single
  // block, both open the card; a wider marquee selects a group instead.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const openId = selected.size === 1 ? [...selected][0] : null;
  const selectOnly = useCallback(
    (id: string) =>
      setSelected((cur) =>
        cur.size === 1 && cur.has(id) ? new Set() : new Set([id])
      ),
    []
  );
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // Rubber-band rectangle, in coordinates relative to the day-column grid.
  const [marquee, setMarquee] = useState<
    { x0: number; y0: number; x1: number; y1: number } | null
  >(null);

  const [nowMin, setNowMin] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  const clipboardRef = useRef<ClipboardData | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ---- the drop surface ---------------------------------------------------
  // Columns can be resized, so measure each one rather than assuming an even
  // split.
  const hitTest = useCallback((x: number, y: number): Hit | null => {
    const el = colsRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      return null;
    }
    const cols = Array.from(el.children) as HTMLElement[];
    let idx = cols.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return x >= r.left && x < r.right;
    });
    if (idx < 0) idx = x <= rect.left + 1 ? 0 : cols.length - 1;
    const rawMin = ((y - rect.top) / rect.height) * 1440;
    return { date: toKey(daysRef.current[idx]), rawMin };
  }, []);

  useEffect(() => {
    registerSurface({ hitTest, scrollEl: scrollRef.current });
    return () => registerSurface(null);
  }, [registerSurface, hitTest]);

  // Open on the working day, not on midnight. Deferred a frame because the
  // scroll container is flex-sized: on the first commit its height can still
  // be 0, and assigning scrollTop to a zero-height element silently does
  // nothing.
  const scrolledOnce = useRef(false);
  useEffect(() => {
    if (scrolledOnce.current) return;
    const target = Math.max(0, 7.5 * HOUR_H - 24);
    const apply = () => {
      const el = scrollRef.current;
      if (!el || el.clientHeight === 0) return false;
      el.scrollTop = target;
      scrolledOnce.current = true;
      return true;
    };
    if (apply()) return;
    const raf = requestAnimationFrame(() => {
      if (!apply()) requestAnimationFrame(apply);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Move the "now" line without re-rendering every second.
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // ---- toast auto-dismiss ------------------------------------------------
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  // ---- keyboard shortcuts (Ctrl+D / Del / Ctrl+C / Ctrl+V) ---------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTextEntryTarget(e.target)) return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (e.key === "Escape" && selected.size) {
        setSelected(new Set());
        return;
      }

      // Del / Backspace -> remove every selected block
      if ((e.key === "Delete" || e.key === "Backspace") && selected.size) {
        e.preventDefault();
        const n = selected.size;
        for (const id of selected) void removeBlock(id);
        setSelected(new Set());
        setToast(n === 1 ? "Block deleted" : `${n} blocks deleted`);
        return;
      }

      if (!ctrl) return;

      const block = openId ? blocks.find((b) => b.id === openId) : null;

      // Ctrl+D -> duplicate every selected block (offset 15 min down)
      if (e.key === "d" && selected.size) {
        e.preventDefault();
        const dupes = blocks.filter((b) => selected.has(b.id));
        for (const b of dupes) {
          void addBlock({
            clientId: b.clientId,
            date: b.date,
            startMin: clamp(b.startMin + 15, 0, 1440 - b.durationMin),
            durationMin: b.durationMin,
            priority: b.priority,
            note: b.note,
          });
        }
        setToast(dupes.length === 1 ? "Block duplicated" : `${dupes.length} blocks duplicated`);
        return;
      }

      // Ctrl+C -> copy selected block to clipboard
      if (e.key === "c" && block) {
        e.preventDefault();
        clipboardRef.current = {
          clientId: block.clientId,
          durationMin: block.durationMin,
          priority: block.priority,
          note: block.note,
        };
        setToast("Block copied");
        return;
      }

      // Ctrl+V -> paste from clipboard
      if (e.key === "v" && clipboardRef.current) {
        e.preventDefault();
        const clip = clipboardRef.current;
        // If a block is selected, paste below it on the same day; otherwise
        // place on the first visible day at 9 AM.
        let date: string;
        let startMin: number;
        if (block) {
          date = block.date;
          startMin = clamp(
            block.startMin + block.durationMin + 15,
            0,
            1440 - clip.durationMin
          );
        } else {
          date = toKey(daysRef.current[0]);
          startMin = 9 * 60;
        }
        void addBlock({
          clientId: clip.clientId,
          date,
          startMin,
          durationMin: clip.durationMin,
          priority: clip.priority,
          note: clip.note,
        });
        setToast("Block pasted");
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, selected, blocks, addBlock, removeBlock]);

  // ---- marquee (drag-highlight) selection --------------------------------
  const onMarqueeDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || e.pointerType === "touch") return;
      // A press that starts on a chip or its resize handle is a move/resize,
      // not a selection sweep -- those stop propagation, but guard anyway.
      if ((e.target as HTMLElement).closest("[data-block-id]")) return;

      const grid = colsRef.current;
      if (!grid) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const base = e.shiftKey ? new Set(selected) : new Set<string>();
      let moved = false;

      const toLocal = (cx: number, cy: number) => {
        const r = grid.getBoundingClientRect();
        return {
          x: clamp(cx - r.left, 0, r.width),
          y: clamp(cy - r.top, 0, r.height),
        };
      };

      const hits = (cx: number, cy: number): Set<string> => {
        const minX = Math.min(startX, cx);
        const maxX = Math.max(startX, cx);
        const minY = Math.min(startY, cy);
        const maxY = Math.max(startY, cy);
        const next = new Set(base);
        grid.querySelectorAll<HTMLElement>("[data-block-id]").forEach((node) => {
          const b = node.getBoundingClientRect();
          if (b.left < maxX && b.right > minX && b.top < maxY && b.bottom > minY) {
            next.add(node.dataset.blockId!);
          }
        });
        return next;
      };

      const onMove = (ev: PointerEvent) => {
        if (!moved) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
          moved = true;
          document.body.style.userSelect = "none";
        }
        ev.preventDefault();
        const a = toLocal(startX, startY);
        const c = toLocal(ev.clientX, ev.clientY);
        setMarquee({ x0: a.x, y0: a.y, x1: c.x, y1: c.y });
        setSelected(hits(ev.clientX, ev.clientY));
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.userSelect = "";
        setMarquee(null);
        // A press that never moved is a click on empty space: drop the
        // selection (unless the user was shift-adding).
        if (!moved && !e.shiftKey) setSelected(new Set());
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [selected]
  );

  /** Move every selected block by the same delta as the dragged anchor. */
  const moveGroup = useCallback(
    (anchor: Block, p: { date: string; startMin: number }) => {
      const keys = daysRef.current.map(toKey);
      const fromIdx = keys.indexOf(anchor.date);
      const toIdx = keys.indexOf(p.date);
      const dayDelta = fromIdx >= 0 && toIdx >= 0 ? toIdx - fromIdx : 0;
      const minDelta = p.startMin - anchor.startMin;
      for (const id of selected) {
        const b = blocks.find((x) => x.id === id);
        if (!b) continue;
        let date = b.date;
        if (dayDelta !== 0) {
          const bi = keys.indexOf(b.date);
          if (bi >= 0) date = keys[clamp(bi + dayDelta, 0, keys.length - 1)];
        }
        const startMin = clamp(b.startMin + minDelta, 0, 1440 - b.durationMin);
        void editBlock(b.id, { date, startMin });
      }
    },
    [selected, blocks, editBlock]
  );

  const byDate = useMemo(() => {
    const m = new Map<string, Block[]>();
    for (const d of days) m.set(toKey(d), []);
    for (const b of blocks) m.get(b.date)?.push(b);
    return m;
  }, [blocks, days]);

  const movingId =
    drag?.active && drag.payload.kind === "move" ? drag.payload.block.id : null;
  const resizing =
    drag?.active && drag.payload.kind === "resize" ? drag.payload.block.id : null;

  const preview = drag?.active ? drag.preview : null;
  const previewClient =
    preview && drag
      ? drag.payload.kind === "client"
        ? clientById(drag.payload.clientId)
        : clientById(drag.payload.block.clientId)
      : undefined;

  const single = days.length === 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* One scroll box for the whole grid: it scrolls vertically through the
          day, and horizontally once the columns are wider than the viewport.
          The header sticks to the top, the hour gutter sticks to the left. */}
      <div
        ref={scrollRef}
        data-grid-scroll
        className="min-h-0 flex-1 overflow-auto"
      >
        <div style={{ width: contentWidth, minWidth: "100%" }}>
          {/* ---- day header (sticky) ------------------------------------- */}
          <div className="sticky top-0 z-30 flex border-b border-edge bg-canvas">
            <div
              className="sticky left-0 z-40 shrink-0 bg-canvas"
              style={{ width: GUTTER_W }}
            />
            <div
              ref={headerColsRef}
              className="grid flex-1"
              style={{ gridTemplateColumns: colTemplate }}
            >
              {days.map((d, i) => {
                const dayBlocks = byDate.get(toKey(d)) ?? [];
                const mins = totalMinutes(dayBlocks);
                const today = isToday(d);
                return (
                  <div
                    key={toKey(d)}
                    className={`relative flex items-center gap-1.5 border-l border-edge px-2 py-2 ${
                      isWeekend(d) ? "bg-panel/60" : ""
                    }`}
                  >
                    <div className="flex shrink-0 items-baseline gap-1.5">
                      <span
                        className={`text-[11px] font-medium uppercase tracking-wide ${
                          today ? "text-brand" : "text-faint"
                        }`}
                      >
                        {DAY_LABELS[(d.getDay() + 6) % 7]}
                      </span>
                      <span
                        className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-[13px] font-semibold tabular-nums ${
                          today ? "bg-brand text-white" : "text-ink"
                        }`}
                      >
                        {d.getDate()}
                      </span>
                    </div>
                    {dayBlocks.length > 0 && (
                      <span
                        className="ml-auto min-w-0 truncate rounded-full bg-sunken px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted"
                        title={`${dayBlocks.length} accounts, ${formatDuration(mins)} booked`}
                      >
                        {single
                          ? `${dayBlocks.length} accounts / ${formatDuration(mins)}`
                          : formatDuration(mins)}
                      </span>
                    )}
                    {/* drag to resize this column; double-click to reset all */}
                    <div
                      onPointerDown={(e) => startColResize(e, i)}
                      onDoubleClick={resetColWidths}
                      title="Drag to resize -- double-click to reset"
                      className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize touch-none hover:bg-brand/25"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex">
            {/* hour gutter (sticky) */}
            <div
              className="sticky left-0 z-20 shrink-0 select-none bg-canvas"
              style={{ width: GUTTER_W, height: DAY_H }}
            >
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="relative"
                  style={{ height: HOUR_H }}
                  aria-hidden={h === 0}
                >
                  {h > 0 && (
                    <span className="absolute right-2 -top-[7px] text-[10.5px] font-medium tabular-nums text-faint">
                      {formatTime(h * 60, { compact: true })}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* day columns */}
            <div
              ref={colsRef}
              onPointerDown={onMarqueeDown}
              className="relative grid flex-1"
              style={{
                gridTemplateColumns: colTemplate,
                height: DAY_H,
              }}
            >
              {days.map((d) => {
              const key = toKey(d);
              const placed = layoutDay(byDate.get(key) ?? []);
              const today = isToday(d);
              return (
                <div
                  key={key}
                  data-day-col={key}
                  className={`relative border-l border-edge ${
                    isWeekend(d) ? "bg-panel/40" : ""
                  }`}
                >
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="hour-cell border-b border-edge-soft"
                      style={{ height: HOUR_H }}
                    />
                  ))}

                  {/* now line */}
                  {today && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20"
                      style={{ top: (nowMin / 1440) * DAY_H }}
                    >
                      <div className="relative h-px bg-red-500">
                        <span className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full bg-red-500" />
                      </div>
                    </div>
                  )}

                  {placed.map(({ block, lane, lanes }) => {
                    const client = clientById(block.clientId);
                    if (!client) return null;
                    const isMoving = movingId === block.id;
                    const isResizing = resizing === block.id;
                    const shown =
                      isResizing && preview
                        ? { ...block, durationMin: preview.durationMin }
                        : block;

                    return (
                      <BlockChip
                        key={block.id}
                        block={shown}
                        clientName={client.name}
                        colorKey={client.colorKey}
                        color={client.color}
                        lane={lane}
                        lanes={lanes}
                        dimmed={isMoving}
                        selected={selected.has(block.id)}
                        compact={lanes > 3}
                        onMove={(e) => {
                          const rect = (
                            e.currentTarget as HTMLElement
                          ).getBoundingClientRect();
                          const grabOffsetMin =
                            ((e.clientY - rect.top) / DAY_H) * 1440;
                          startBlockMove(
                            e,
                            block,
                            grabOffsetMin,
                            (p) => {
                              if (selected.size > 1 && selected.has(block.id)) {
                                moveGroup(block, p);
                              } else {
                                void editBlock(block.id, {
                                  date: p.date,
                                  startMin: p.startMin,
                                });
                              }
                            },
                            () => selectOnly(block.id)
                          );
                        }}
                        onResize={(e) =>
                          startBlockResize(
                            e,
                            block,
                            (p) =>
                              void editBlock(block.id, {
                                durationMin: p.durationMin,
                              })
                          )
                        }
                      />
                    );
                  })}

                  {/* drop preview */}
                  {preview && preview.date === key && previewClient && (
                    <div
                      className="pointer-events-none absolute left-0.5 right-0.5 z-[45] overflow-hidden rounded-md border-2 border-dashed border-brand bg-brand-soft/85 px-1.5 py-1 shadow-lg"
                      style={{
                        top: (preview.startMin / 1440) * DAY_H,
                        height: Math.max(
                          20,
                          (preview.durationMin / 1440) * DAY_H - 2
                        ),
                      }}
                    >
                      <div className="truncate text-[11px] font-semibold leading-tight text-brand-ink">
                        {previewClient.name}
                      </div>
                      <div className="truncate text-[10px] tabular-nums text-brand-ink/80">
                        {formatTime(preview.startMin)} &middot;{" "}
                        {formatDuration(preview.durationMin)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* marquee rectangle */}
            {marquee && (
              <div
                className="pointer-events-none absolute z-[60] rounded-[2px] border border-brand bg-brand-soft/25"
                style={{
                  left: Math.min(marquee.x0, marquee.x1),
                  top: Math.min(marquee.y0, marquee.y1),
                  width: Math.abs(marquee.x1 - marquee.x0),
                  height: Math.abs(marquee.y1 - marquee.y0),
                }}
              />
            )}
            </div>
          </div>
        </div>
      </div>

      {openId && (
        <BlockDetail blockId={openId} onClose={clearSelection} />
      )}

      {selected.size > 1 && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-50 -translate-x-1/2">
          <div className="pop-in rounded-lg border border-edge bg-canvas/95 px-3 py-1.5 text-[11.5px] font-medium text-ink shadow-lg backdrop-blur">
            {selected.size} selected &middot; Del to remove &middot; Ctrl+D to duplicate
          </div>
        </div>
      )}

      {/* Shortcut toast */}
      {toast && (
        <div
          className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 ${
            selected.size > 1 ? "bottom-14" : "bottom-4"
          }`}
        >
          <div className="pop-in rounded-lg border border-edge bg-canvas/95 px-3 py-1.5 text-[11.5px] font-medium text-ink shadow-lg backdrop-blur">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

function BlockChip({
  block,
  clientName,
  colorKey,
  color,
  lane,
  lanes,
  dimmed,
  selected,
  compact,
  onMove,
  onResize,
}: {
  block: Block;
  clientName: string;
  colorKey: number;
  color: string | null;
  lane: number;
  lanes: number;
  dimmed: boolean;
  selected: boolean;
  compact: boolean;
  onMove: (e: React.PointerEvent) => void;
  onResize: (e: React.PointerEvent) => void;
}) {
  const accent = accentFor({ colorKey, color });
  const top = (block.startMin / 1440) * DAY_H;
  const height = Math.max(18, (block.durationMin / 1440) * DAY_H - 2);
  const tiny = height < 34;
  const pr = PRIORITY_META[block.priority];

  // Cascade rather than an even split. Three accounts stacked on one morning
  // in a 130px column leaves 43px each, which truncates every name to
  // "Ashl...". Overlapping them and stepping the z-index keeps the leading
  // edge of each card readable, the way Apple Calendar and Outlook do it,
  // while still making the pile-up obvious at a glance.
  const step = lanes > 1 ? 100 / lanes : 100;
  const left = lane * step;
  const width = Math.min(100 - left, lanes > 1 ? step * 1.75 : 100);

  return (
    <div
      data-block-id={block.id}
      onPointerDown={onMove}
      className={`no-touch-scroll group absolute cursor-grab overflow-hidden rounded-md border pl-2 pr-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-shadow active:cursor-grabbing ${accent.chip} ${
        dimmed ? "opacity-30" : "hover:shadow-md"
      } ${selected ? `ring-2 ${accent.ring}` : ""}`}
      style={{
        ...accent.style,
        top,
        height,
        left: `calc(${left}% + 2px)`,
        width: `calc(${width}% - 4px)`,
        paddingTop: tiny ? 1 : 4,
        // Later lanes sit on top so the cascade reads left-to-right; hover and
        // selection lift a card above the whole pile.
        zIndex: (selected ? 40 : 10) + lane,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.zIndex = String(30 + lane);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.zIndex = String((selected ? 40 : 10) + lane);
      }}
      title={`${clientName} -- ${formatTime(block.startMin)} to ${formatTime(
        block.startMin + block.durationMin
      )}`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-[3px] ${accent.bar}`}
        aria-hidden
      />
      <div className="flex items-start gap-1">
        <span
          className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${pr.dot}`}
          title={`${pr.label} priority`}
          aria-label={`${pr.label} priority`}
        />
        <div className="min-w-0 flex-1">
          <div
            className={`truncate font-semibold leading-tight ${accent.text} ${
              tiny ? "text-[10px]" : "text-[11.5px]"
            }`}
          >
            {clientName}
          </div>
          {!tiny && !compact && (
            <div className={`truncate text-[10px] tabular-nums ${accent.text} opacity-70`}>
              {formatTime(block.startMin)} &middot;{" "}
              {formatDuration(block.durationMin)}
            </div>
          )}
        </div>
      </div>

      {/* resize handle */}
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          onResize(e);
        }}
        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
      >
        <div className="mx-auto mb-[3px] h-[3px] w-6 rounded-full bg-current opacity-0 transition-opacity group-hover:opacity-25" />
      </div>
    </div>
  );
}
