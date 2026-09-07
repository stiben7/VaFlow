"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { accentFor, SERVICE_BADGE_OFF, SERVICE_BADGE_ON } from "@/lib/colors";
import { linkify } from "@/lib/linkify";
import type { Client, ServiceTag } from "@/lib/types";
import ClientDialog from "@/components/ClientDialog";
import {
  PlusIcon,
  SearchIcon,
  LinkIcon,
  TrashIcon,
  PencilIcon,
  CalendarIcon,
  CloseIcon,
} from "@/components/Icons";

export default function ClientsPage() {
  const { clients, blocks, ready, removeClient, serviceTags } = useStore();
  const [q, setQ] = useState("");
  const [service, setService] = useState<ServiceTag | null>(null);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const blockCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of blocks) m.set(b.clientId, (m.get(b.clientId) ?? 0) + 1);
    return m;
  }, [blocks]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = clients
      .filter((c) => !c.archived)
      .filter((c) => (service ? c.serviceTags.includes(service) : true))
      .filter(
        (c) =>
          !needle ||
          c.name.toLowerCase().includes(needle) ||
          c.notes.toLowerCase().includes(needle) ||
          c.serviceTags.join(" ").toLowerCase().includes(needle)
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    const map = new Map<string, Client[]>();
    for (const c of filtered) {
      const letter = c.name[0]?.toUpperCase() ?? "#";
      const key = /[A-Z]/.test(letter) ? letter : "#";
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [clients, q, service]);

  const shown = groups.reduce((n, [, list]) => n + list.length, 0);
  const confirming = confirmId
    ? clients.find((c) => c.id === confirmId)
    : undefined;
  const editingClient = editId
    ? clients.find((c) => c.id === editId)
    : undefined;

  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-edge bg-canvas px-5 py-3">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-ink">
            Clients
          </h1>
          <p className="text-[11px] text-faint">
            {ready ? `${shown} accounts` : "Loading..."}
          </p>
        </div>

        <div className="relative ml-auto w-full max-w-[280px] sm:w-64">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, notes, services"
            className="w-full rounded-md border border-edge bg-canvas py-[7px] pl-8 pr-3 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </div>

        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-[7px] text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
        >
          <PlusIcon />
          Add client
        </button>
      </header>

      <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-edge bg-panel px-5 py-2">
        <button
          onClick={() => setService(null)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
            service === null
              ? "bg-brand text-white"
              : "bg-sunken text-muted hover:text-ink"
          }`}
        >
          All
        </button>
        {serviceTags.map((t) => {
          const count = clients.filter(
            (c) => !c.archived && c.serviceTags.includes(t)
          ).length;
          return (
            <button
              key={t}
              onClick={() => setService(service === t ? null : t)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                service === t
                  ? SERVICE_BADGE_ON
                  : `${SERVICE_BADGE_OFF} hover:text-ink`
              }`}
            >
              {t}
              <span className="tabular-nums opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {!ready ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-sunken" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-[13px] text-muted">No accounts match that.</p>
            <button
              onClick={() => {
                setQ("");
                setService(null);
              }}
              className="mt-2 text-[12.5px] font-medium text-brand hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-6">
            {groups.map(([letter, list]) => (
              <section key={letter}>
                <h2 className="sticky top-0 z-10 -mx-1 bg-canvas/90 px-1 py-1 text-[11px] font-bold uppercase tracking-widest text-faint backdrop-blur">
                  {letter}
                </h2>
                <ul className="mt-1 space-y-1.5">
                  {list.map((c) => (
                    <ClientRow
                      key={c.id}
                      client={c}
                      scheduled={blockCount.get(c.id) ?? 0}
                      onEdit={() => setEditId(c.id)}
                      onDelete={() => setConfirmId(c.id)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {adding && <ClientDialog onClose={() => setAdding(false)} />}

      {editingClient && (
        <ClientDialog
          key={editingClient.id}
          client={editingClient}
          onClose={() => setEditId(null)}
        />
      )}

      {confirming && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmId(null);
          }}
        >
          <div className="pop-in w-full max-w-[380px] rounded-xl border border-edge bg-canvas p-5 shadow-2xl">
            <h2 className="text-[14px] font-semibold text-ink">
              Remove {confirming.name}?
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              This also clears its{" "}
              {blockCount.get(confirming.id) ?? 0} scheduled block
              {(blockCount.get(confirming.id) ?? 0) === 1 ? "" : "s"} from the
              calendar. It cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmId(null)}
                className="rounded-md px-3 py-1.5 text-[12.5px] font-medium text-muted hover:bg-sunken hover:text-ink"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  void removeClient(confirming.id);
                  setConfirmId(null);
                }}
                className="rounded-md bg-danger px-3.5 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ClientRow({
  client,
  scheduled,
  onEdit,
  onDelete,
}: {
  client: Client;
  scheduled: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const accent = accentFor(client);

  return (
    <li
      style={accent.style}
      className="group relative overflow-hidden rounded-lg border border-edge bg-canvas transition-colors hover:border-faint"
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${accent.bar}`} />
      <div className="flex items-start gap-3 py-2.5 pl-4 pr-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-ink">
              {client.name}
            </span>
            {client.serviceTags.map((t) => (
              <span
                key={t}
                className={`rounded px-1.5 py-[1px] text-[10px] font-medium ${SERVICE_BADGE_ON}`}
              >
                {t}
              </span>
            ))}
            {scheduled > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-muted">
                <CalendarIcon className="h-3 w-3" />
                {scheduled}
              </span>
            )}
          </div>
          {!open && client.notes && (
            <p className="mt-0.5 truncate text-[11.5px] text-faint">
              {client.notes}
            </p>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {client.link && (
            <a
              href={client.link}
              target="_blank"
              rel="noreferrer"
              title="Open project link"
              className="rounded-md p-1.5 text-faint hover:bg-sunken hover:text-brand"
            >
              <LinkIcon />
            </a>
          )}
          <Link
            href="/my-week"
            title="Schedule in My Week"
            className="rounded-md p-1.5 text-faint hover:bg-sunken hover:text-brand"
          >
            <CalendarIcon />
          </Link>
          <button
            onClick={onEdit}
            title="Edit client"
            className="rounded-md p-1.5 text-faint hover:bg-sunken hover:text-brand"
          >
            <PencilIcon />
          </button>
          <button
            onClick={onDelete}
            title="Remove client"
            className="rounded-md p-1.5 text-faint hover:bg-danger/10 hover:text-danger"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-edge bg-panel px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">
                Notes
              </div>
              <p className="mt-1 max-w-2xl whitespace-pre-wrap text-[12px] leading-relaxed text-muted">
                {client.notes ? linkify(client.notes) : "Nothing yet."}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Collapse"
              className="rounded-md p-1 text-faint hover:bg-sunken hover:text-ink"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
