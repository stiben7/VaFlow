"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useDrag, type Hit } from "@/lib/drag";
import { accentFor, PRIORITY_META } from "@/lib/colors";
import { layoutDay, totalMinutes } from "@/lib/layout";
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
  const daysRef = useRef(days);
  daysRef.current = days;

  const [openId, setOpenId] = useState<string | null>(null);
  const [nowMin, setNowMin] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  const [scrollbarW, setScrollbarW] = useState(0);
  const clipboardRef = useRef<ClipboardData | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ---- the drop surface ---------------------------------------------------
  const hitTest = useCallback((x: number, y: number): Hit | null => {
    const el = colsRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      return null;
    }
    const cols = daysRef.current.length;
    const colW = rect.width / cols;
    const idx = clamp(Math.floor((x - rect.left) / colW), 0, cols - 1);
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

  // ---- scrollbar width measurement (keeps header aligned with grid) ------
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setScrollbarW(el.offsetWidth - el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
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
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Del / Backspace -> remove selected block
      if ((e.key === "Delete" || e.key === "Backspace") && openId) {
        e.preventDefault();
        void removeBlock(openId);
        setOpenId(null);
        setToast("Block deleted");
        return;
      }

      if (!ctrl) return;

      const block = openId ? blocks.find((b) => b.id === openId) : null;

      // Ctrl+D -> duplicate selected block (offset 15 min down)
      if (e.key === "d" && block) {
        e.preventDefault();
        const newStart = clamp(block.startMin + 15, 0, 1440 - block.durationMin);
        void addBlock({
          clientId: block.clientId,
          date: block.date,
          startMin: newStart,
          durationMin: block.durationMin,
          priority: block.priority,
          note: block.note,
        });
        setToast("Block duplicated");
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
  }, [openId, blocks, addBlock, removeBlock]);

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
      {/* ---- day header ---------------------------------------------------- */}
      <div
        className="flex shrink-0 border-b border-edge bg-canvas"
        style={{ paddingRight: scrollbarW }}
      >
        <div className="shrink-0" style={{ width: GUTTER_W }} />
        <div
          className="grid flex-1"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}
        >
          {days.map((d) => {
            const dayBlocks = byDate.get(toKey(d)) ?? [];
            const mins = totalMinutes(dayBlocks);
            const today = isToday(d);
            return (
              <div
                key={toKey(d)}
                className={`flex items-center gap-2 border-l border-edge px-2.5 py-2 ${
                  isWeekend(d) ? "bg-panel/60" : ""
                }`}
              >
                <div className="flex items-baseline gap-1.5">
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
                    className="ml-auto shrink-0 rounded-full bg-sunken px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted"
                    title={`${dayBlocks.length} accounts, ${formatDuration(mins)} booked`}
                  >
                    {single
                      ? `${dayBlocks.length} accounts / ${formatDuration(mins)}`
                      : formatDuration(mins)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- scrollable body ----------------------------------------------- */}
      <div
        ref={scrollRef}
        data-grid-scroll
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="flex">
          {/* hour gutter */}
          <div
            className="relative shrink-0 select-none"
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
            className="relative grid flex-1"
            style={{
              gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))`,
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
                        lane={lane}
                        lanes={lanes}
                        dimmed={isMoving}
                        selected={openId === block.id}
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
                            (p) =>
                              void editBlock(block.id, {
                                date: p.date,
                                startMin: p.startMin,
                              }),
                            () => setOpenId((cur) => (cur === block.id ? null : block.id))
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
          </div>
        </div>
      </div>

      {openId && (
        <BlockDetail blockId={openId} onClose={() => setOpenId(null)} />
      )}

      {/* Shortcut toast */}
      {toast && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-50 -translate-x-1/2">
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
  lane: number;
  lanes: number;
  dimmed: boolean;
  selected: boolean;
  compact: boolean;
  onMove: (e: React.PointerEvent) => void;
  onResize: (e: React.PointerEvent) => void;
}) {
  const accent = accentFor(colorKey);
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
        {block.priority === "high" && (
          <span
            className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${pr.dot}`}
            title="High priority"
          />
        )}
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
