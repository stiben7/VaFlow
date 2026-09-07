"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, readLegacyLocalData } from "@/lib/store";
import { useDrag, DEFAULT_DURATION } from "@/lib/drag";
import { accentFor, SERVICE_BADGE_OFF, SERVICE_BADGE_ON } from "@/lib/colors";
import type { Client, ServiceTag } from "@/lib/types";
import { downloadBackup, parseBackup, BackupError } from "@/lib/backup";
import {
  SearchIcon, PlusIcon, CloseIcon, DownloadIcon, UploadIcon, PencilIcon,
} from "./Icons";
import ClientDialog from "./ClientDialog";
import Tooltip from "./Tooltip";

const LEGACY_DISMISSED = "vaflow.legacyDismissed";

export default function ClientPool({
  visibleDates,
}: {
  /** The date keys currently on screen, used for the "booked" count. */
  visibleDates: string[];
}) {
  const {
    clients, blocks, addBlock, ready, mode,
    serviceTags, importData,
  } = useStore();
  const { startClientDrag, drag } = useDrag();

  const [q, setQ] = useState("");
  const [serviceFilter, setServiceFilter] = useState<ServiceTag | null>(null);
  const [unscheduledOnly, setUnscheduledOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- leftover browser data from before sign-in -------------------------
  const [legacy, setLegacy] = useState<{ clients: number; blocks: number } | null>(null);
  useEffect(() => {
    if (mode !== "cloud" || !ready) return;
    try {
      if (window.localStorage.getItem(LEGACY_DISMISSED)) return;
    } catch {
      return;
    }
    const found = readLegacyLocalData();
    if (found) setLegacy({ clients: found.clients.length, blocks: found.blocks.length });
  }, [mode, ready]);

  function dismissLegacy() {
    try {
      window.localStorage.setItem(LEGACY_DISMISSED, "1");
    } catch {
      /* ignore */
    }
    setLegacy(null);
  }

  async function migrateLegacy() {
    const found = readLegacyLocalData();
    if (!found) return dismissLegacy();
    setBusy("migrate");
    try {
      const plan = await importData(found);
      setToast({
        kind: "ok",
        text: `Brought over ${plan.newClients.length} clients and ${plan.newBlocks.length} blocks.`,
      });
      dismissLegacy();
    } catch (err) {
      setToast({
        kind: "err",
        text: err instanceof Error ? err.message : "Import failed.",
      });
    } finally {
      setBusy(null);
    }
  }

  // ---- import / export ---------------------------------------------------
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked twice
    if (!file) return;

    setBusy("import");
    try {
      const parsed = parseBackup(await file.text());
      const plan = await importData(parsed);
      const bits = [`${plan.newClients.length} clients`, `${plan.newBlocks.length} blocks`];
      if (plan.skippedClients) bits.push(`${plan.skippedClients} already here`);
      if (plan.droppedBlocks) bits.push(`${plan.droppedBlocks} orphaned blocks skipped`);
      setToast({ kind: "ok", text: `Imported ${bits.join(", ")}.` });
    } catch (err) {
      setToast({
        kind: "err",
        text:
          err instanceof BackupError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Import failed.",
      });
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  // ---- derived -----------------------------------------------------------
  const dateSet = useMemo(() => new Set(visibleDates), [visibleDates]);

  const bookedCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of blocks) {
      if (!dateSet.has(b.date)) continue;
      m.set(b.clientId, (m.get(b.clientId) ?? 0) + 1);
    }
    return m;
  }, [blocks, dateSet]);

  const active = useMemo(() => clients.filter((c) => !c.archived), [clients]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return active
      .filter((c) => (serviceFilter ? c.serviceTags.includes(serviceFilter) : true))
      .filter((c) => (unscheduledOnly ? !bookedCount.get(c.id) : true))
      .filter(
        (c) =>
          !needle ||
          c.name.toLowerCase().includes(needle) ||
          c.serviceTags.join(" ").toLowerCase().includes(needle) ||
          c.notes.toLowerCase().includes(needle)
      );
  }, [active, q, serviceFilter, unscheduledOnly, bookedCount]);

  const editingClient = editId ? clients.find((c) => c.id === editId) : undefined;

  const draggingId =
    drag?.active && drag.payload.kind === "client" ? drag.payload.clientId : null;
  const unbooked = active.filter((c) => !bookedCount.get(c.id)).length;
  const empty = ready && active.length === 0;

  return (
    <>
      <aside className="flex w-[292px] shrink-0 flex-col border-r border-edge bg-panel">
        {/* Header */}
        <div className="px-3.5 pt-3.5 pb-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold tracking-tight text-ink">
              Client roster
            </h2>
            <div className="flex items-center gap-0.5">
              <Tooltip label="Download client data" side="bottom">
                <button
                  onClick={() => downloadBackup(clients, blocks)}
                  disabled={clients.length === 0}
                  aria-label="Download client data"
                  className="rounded-md p-1.5 text-faint transition-colors hover:bg-sunken hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <DownloadIcon className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <Tooltip label="Upload client data" side="bottom">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={busy !== null}
                  aria-label="Upload client data"
                  className="rounded-md p-1.5 text-faint transition-colors hover:bg-sunken hover:text-ink disabled:opacity-30"
                >
                  <UploadIcon className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <span className="ml-1 text-[11px] tabular-nums text-faint">
                {visible.length}
                {visible.length !== active.length && ` / ${active.length}`}
              </span>
            </div>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-faint">
            Drag an account onto the grid to give it time.
          </p>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={onFile}
          className="hidden"
        />

        {/* Migration offer */}
        {legacy && (
          <div className="mx-3.5 mb-2.5 rounded-lg border border-brand/40 bg-brand-soft p-3">
            <p className="text-[11.5px] font-semibold text-brand-ink">
              Found earlier work in this browser
            </p>
            <p className="mt-1 text-[11px] leading-snug text-brand-ink/80">
              {legacy.clients} clients and {legacy.blocks} scheduled blocks were
              saved here before you signed in. Bring them into your account?
            </p>
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={migrateLegacy}
                disabled={busy !== null}
                className="rounded-md bg-brand px-2.5 py-1 text-[11.5px] font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy === "migrate" ? "Importing..." : "Import them"}
              </button>
              <button
                onClick={dismissLegacy}
                className="rounded-md px-2.5 py-1 text-[11.5px] font-medium text-brand-ink hover:bg-brand/10"
              >
                No thanks
              </button>
            </div>
          </div>
        )}

        {toast && (
          <div
            className={`mx-3.5 mb-2.5 rounded-md border px-2.5 py-2 text-[11px] leading-snug ${
              toast.kind === "ok"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
                : "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
            }`}
          >
            {toast.text}
          </div>
        )}

        {!empty && (
          <>
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
              {serviceTags.map((t) => {
                const on = serviceFilter === t;
                return (
                  <button
                    key={t}
                    onClick={() => setServiceFilter(on ? null : t)}
                    className={`rounded-full px-2 py-[3px] text-[10.5px] font-medium transition-colors ${
                      on ? SERVICE_BADGE_ON : `${SERVICE_BADGE_OFF} hover:text-ink`
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>

            {/* The fastest answer to "who am I forgetting". */}
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
          </>
        )}

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
          {!ready ? (
            <div className="space-y-1.5 px-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-sunken" />
              ))}
            </div>
          ) : empty ? (
            <div className="px-1.5 pt-2">
              <p className="text-[12.5px] font-medium text-ink">No clients yet</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                Add your accounts one at a time, or restore them from a backup
                file.
              </p>
              <div className="mt-3 space-y-1.5">
                <button
                  onClick={() => setAdding(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md bg-brand py-2 text-[12.5px] font-medium text-white hover:opacity-90"
                >
                  <PlusIcon />
                  Add your first client
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={busy !== null}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-edge bg-canvas py-2 text-[12.5px] font-medium text-ink hover:bg-sunken disabled:opacity-50"
                >
                  <UploadIcon className="h-3.5 w-3.5" />
                  {busy === "import" ? "Importing..." : "Import a backup"}
                </button>
              </div>
            </div>
          ) : visible.length === 0 ? (
            <div className="px-2 py-8 text-center">
              <p className="text-[12.5px] text-muted">No accounts match.</p>
              <button
                onClick={() => {
                  setQ("");
                  setServiceFilter(null);
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
                  onEdit={() => setEditId(c.id)}
                  onPointerDown={(e) =>
                    startClientDrag(e, c.id, (p) => {
                      void addBlock({
                        clientId: c.id,
                        date: p.date,
                        startMin: p.startMin,
                        durationMin: p.durationMin || DEFAULT_DURATION,
                        priority: "normal",
                        note: null,
                      }).catch(() =>
                        setToast({ kind: "err", text: "Could not save that block." })
                      );
                    })
                  }
                />
              ))}
            </ul>
          )}
        </div>

        {/* Add */}
        {!empty && (
          <div className="border-t border-edge p-2.5">
            <button
              onClick={() => setAdding(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-edge bg-canvas py-2 text-[12.5px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-ink"
            >
              <PlusIcon />
              Add client
            </button>
          </div>
        )}
      </aside>

      {adding && <ClientDialog onClose={() => setAdding(false)} />}
      {editingClient && (
        <ClientDialog client={editingClient} onClose={() => setEditId(null)} />
      )}
    </>
  );
}

function PoolCard({
  client, booked, dimmed, onEdit, onPointerDown,
}: {
  client: Client;
  booked: number;
  dimmed: boolean;
  onEdit: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const accent = accentFor(client);
  return (
    <li>
      <div
        onPointerDown={onPointerDown}
        title={client.notes || client.name}
        style={accent.style}
        className={`no-touch-scroll group relative cursor-grab overflow-hidden rounded-md border bg-canvas pl-2.5 pr-2 py-2 transition-all active:cursor-grabbing ${
          dimmed
            ? "opacity-35"
            : "border-edge hover:border-faint hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
        }`}
      >
        <span className={`absolute inset-y-0 left-0 w-[3px] ${accent.bar}`} aria-hidden />
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onEdit}
          aria-label={`Edit ${client.name}`}
          title="Edit client"
          className="absolute right-1 top-1 z-10 rounded-md bg-canvas/80 p-1 text-faint opacity-0 backdrop-blur transition-opacity hover:text-brand group-hover:opacity-100 focus-visible:opacity-100"
        >
          <PencilIcon className="h-3.5 w-3.5" />
        </button>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium leading-tight text-ink">
              {client.name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {client.serviceTags.map((t) => (
                <span
                  key={t}
                  className={`rounded px-1.5 py-[1px] text-[10px] font-medium ${SERVICE_BADGE_ON}`}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          {booked > 0 && (
            <span
              title={`${booked} block${booked > 1 ? "s" : ""} in view`}
              className="mt-0.5 shrink-0 rounded-full bg-sunken px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted transition-opacity group-hover:opacity-0"
            >
              {booked}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
