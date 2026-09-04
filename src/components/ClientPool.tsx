"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useDrag, DEFAULT_DURATION } from "@/lib/drag";
import { accentFor, TIER_BADGE, TIER_SHORT } from "@/lib/colors";
import { TIERS, type Client, type Tier } from "@/lib/types";
import { SearchIcon, PlusIcon, CloseIcon } from "./Icons";
import AddClientDialog from "./AddClientDialog";

export default function ClientPool({
  visibleDates,
}: {
  /** The date keys currently on screen, used for the "booked" count. */
  visibleDates: string[];
}) {
  const { clients, blocks, addBlock, ready } = useStore();
  const { startClientDrag, drag } = useDrag();

  const [q, setQ] = useState("");
  const [tierFilter, setTierFilter] = useState<Tier | null>(null);
  const [unscheduledOnly, setUnscheduledOnly] = useState(false);
  const [adding, setAdding] = useState(false);

  const dateSet = useMemo(() => new Set(visibleDates), [visibleDates]);

  /** How many blocks each client has inside the visible range. */
  const bookedCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of blocks) {
      if (!dateSet.has(b.date)) continue;
      m.set(b.clientId, (m.get(b.clientId) ?? 0) + 1);
    }
    return m;
  }, [blocks, dateSet]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clients
      .filter((c) => !c.archived)
      .filter((c) => (tierFilter ? c.tier === tierFilter : true))
      .filter((c) => (unscheduledOnly ? !bookedCount.get(c.id) : true))
      .filter(
        (c) =>
          !needle ||
          c.name.toLowerCase().includes(needle) ||
          c.tier.toLowerCase().includes(needle) ||
          (c.strategist ?? "").toLowerCase().includes(needle)
      );
  }, [clients, q, tierFilter, unscheduledOnly, bookedCount]);

  const draggingId =
    drag?.active && drag.payload.kind === "client" ? drag.payload.clientId : null;

  const unbooked = clients.filter(
    (c) => !c.archived && !bookedCount.get(c.id)
  ).length;

  return (
    <>
      <aside className="flex w-[292px] shrink-0 flex-col border-r border-edge bg-panel">
        {/* Header */}
        <div className="px-3.5 pt-3.5 pb-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-semibold tracking-tight text-ink">
              Client roster
            </h2>
            <span className="text-[11px] tabular-nums text-faint">
              {visible.length}
              {visible.length !== clients.filter((c) => !c.archived).length &&
                ` / ${clients.filter((c) => !c.archived).length}`}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-faint">
            Drag an account onto the grid to give it time.
          </p>
        </div>

        {/* Search */}
        <div className="px-3.5 pb-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search accounts"
              className="w-full rounded-md border border-edge bg-canvas py-[7px] pl-8 pr-7 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-ink"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-1 px-3.5 pb-2.5">
          {(TIERS as Tier[]).map((t) => {
            const on = tierFilter === t;
            return (
              <button
                key={t}
                onClick={() => setTierFilter(on ? null : t)}
                className={`rounded-full px-2 py-[3px] text-[10.5px] font-medium transition-all ${
                  on
                    ? "bg-brand text-white"
                    : `${TIER_BADGE[t]} opacity-70 hover:opacity-100`
                }`}
              >
                {TIER_SHORT[t]}
              </button>
            );
          })}
        </div>

        {/* Unscheduled toggle -- the single most useful filter when you are
            staring at 26 accounts and cannot tell which ones you have forgotten. */}
        <label className="mx-3.5 mb-2.5 flex cursor-pointer items-center gap-2 rounded-md border border-edge bg-canvas px-2.5 py-2">
          <input
            type="checkbox"
            checked={unscheduledOnly}
            onChange={(e) => setUnscheduledOnly(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--color-brand)]"
          />
          <span className="text-[12px] text-muted">Not yet booked</span>
          <span className="ml-auto rounded-full bg-sunken px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-muted">
            {unbooked}
          </span>
        </label>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
          {!ready ? (
            <div className="space-y-1.5 px-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-sunken" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="px-2 py-8 text-center">
              <p className="text-[12.5px] text-muted">No accounts match.</p>
              <button
                onClick={() => {
                  setQ("");
                  setTierFilter(null);
                  setUnscheduledOnly(false);
                }}
                className="mt-1.5 text-[12px] font-medium text-brand hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <ul className="space-y-1">
              {visible.map((c) => (
                <PoolCard
                  key={c.id}
                  client={c}
                  booked={bookedCount.get(c.id) ?? 0}
                  dimmed={draggingId === c.id}
                  onPointerDown={(e) =>
                    startClientDrag(e, c.id, (p) =>
                      void addBlock({
                        clientId: c.id,
                        date: p.date,
                        startMin: p.startMin,
                        durationMin: p.durationMin || DEFAULT_DURATION,
                        priority: "normal",
                        note: null,
                      })
                    )
                  }
                />
              ))}
            </ul>
          )}
        </div>

        {/* Add */}
        <div className="border-t border-edge p-2.5">
          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-edge bg-canvas py-2 text-[12.5px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-ink"
          >
            <PlusIcon />
            Add client
          </button>
        </div>
      </aside>

      {adding && <AddClientDialog onClose={() => setAdding(false)} />}
    </>
  );
}

function PoolCard({
  client,
  booked,
  dimmed,
  onPointerDown,
}: {
  client: Client;
  booked: number;
  dimmed: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const accent = accentFor(client.colorKey);
  return (
    <li>
      <div
        onPointerDown={onPointerDown}
        title={client.services || client.name}
        className={`no-touch-scroll group relative cursor-grab overflow-hidden rounded-md border bg-canvas pl-2.5 pr-2 py-2 transition-all active:cursor-grabbing ${
          dimmed
            ? "opacity-35"
            : "border-edge hover:border-faint hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
        }`}
      >
        <span
          className={`absolute inset-y-0 left-0 w-[3px] ${accent.bar}`}
          aria-hidden
        />
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium leading-tight text-ink">
              {client.name}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className={`rounded px-1.5 py-[1px] text-[10px] font-medium ${TIER_BADGE[client.tier]}`}
              >
                {TIER_SHORT[client.tier]}
              </span>
              {client.strategist && (
                <span className="truncate text-[10.5px] text-faint">
                  {client.strategist}
                </span>
              )}
            </div>
          </div>
          {booked > 0 && (
            <span
              title={`${booked} block${booked > 1 ? "s" : ""} in view`}
              className="mt-0.5 shrink-0 rounded-full bg-sunken px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted"
            >
              {booked}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
