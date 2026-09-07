"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { accentFor, PRIORITY_META, SERVICE_BADGE_ON } from "@/lib/colors";
import { PRIORITIES, type Priority } from "@/lib/types";
import { formatDayLong, formatDuration, formatTime, fromKey } from "@/lib/date";
import { CloseIcon, TrashIcon, LinkIcon, ClockIcon, PencilIcon } from "./Icons";
import ClientDialog from "./ClientDialog";

const W = 288;
const GAP = 8;
const DURATIONS = [30, 60, 90, 120, 180, 240];

/**
 * Anchored detail card for one scheduled block. Positioned against the block's
 * own DOM rect so it behaves like a calendar event popover rather than a modal
 * -- the grid stays visible and in context behind it.
 */
export default function BlockDetail({
  blockId,
  onClose,
}: {
  blockId: string;
  onClose: () => void;
}) {
  const { blocks, clientById, editBlock, removeBlock } = useStore();
  const block = blocks.find((b) => b.id === blockId);
  const client = block ? clientById(block.clientId) : undefined;

  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [note, setNote] = useState(block?.note ?? "");
  const [editing, setEditing] = useState(false);

  useLayoutEffect(() => {
    const anchor = document.querySelector<HTMLElement>(
      `[data-block-id="${blockId}"]`
    );
    const card = cardRef.current;
    if (!anchor || !card) return;

    const a = anchor.getBoundingClientRect();
    const h = card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer the right of the block; flip left when it would overflow.
    let left = a.right + GAP;
    if (left + W > vw - 8) left = a.left - W - GAP;
    if (left < 8) left = Math.max(8, (vw - W) / 2);

    let top = a.top;
    if (top + h > vh - 8) top = vh - h - 8;
    if (top < 8) top = 8;

    setPos({ top, left });
  }, [blockId]);

  useEffect(() => {
    // While the edit dialog is open it owns dismissal -- the popover must not
    // close underneath it (that would unmount the dialog too).
    if (editing) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (cardRef.current?.contains(t)) return;
      if ((t as HTMLElement).closest?.(`[data-block-id="${blockId}"]`)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, blockId, editing]);

  if (!block || !client) return null;

  if (editing) {
    return (
      <ClientDialog client={client} onClose={() => setEditing(false)} />
    );
  }

  const accent = accentFor(client);
  const end = block.startMin + block.durationMin;

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label={`${client.name} block details`}
      className="pop-in fixed z-50 overflow-hidden rounded-xl border border-edge bg-canvas shadow-2xl"
      style={{
        ...accent.style,
        width: W,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
      }}
    >
      <div className={`h-1 w-full ${accent.bar}`} />

      <div className="px-4 pb-3 pt-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-[13.5px] font-semibold leading-tight text-ink">
              {client.name}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
          <div className="-mr-1 -mt-0.5 flex shrink-0 items-center">
            <button
              onClick={() => setEditing(true)}
              aria-label="Edit client"
              title="Edit client"
              className="rounded-md p-1 text-faint hover:bg-sunken hover:text-brand"
            >
              <PencilIcon />
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-faint hover:bg-sunken hover:text-ink"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-muted">
          <ClockIcon className="h-3.5 w-3.5" />
          <span className="tabular-nums">
            {formatTime(block.startMin)} &ndash; {formatTime(end)}
          </span>
          <span className="text-faint">
            &middot; {formatDuration(block.durationMin)}
          </span>
        </div>
        <div className="mt-0.5 pl-5 text-[11px] text-faint">
          {formatDayLong(fromKey(block.date))}
        </div>
      </div>

      {/* Duration */}
      <div className="border-t border-edge px-4 py-2.5">
        <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
          Duration
        </div>
        <div className="flex flex-wrap gap-1">
          {DURATIONS.map((d) => (
            <button
              key={d}
              onClick={() => void editBlock(block.id, { durationMin: d })}
              className={`rounded px-2 py-1 text-[11px] font-medium tabular-nums transition-colors ${
                block.durationMin === d
                  ? "bg-brand text-white"
                  : "bg-sunken text-muted hover:text-ink"
              }`}
            >
              {formatDuration(d)}
            </button>
          ))}
        </div>
      </div>

      {/* Priority */}
      <div className="border-t border-edge px-4 py-2.5">
        <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
          Priority
        </div>
        <div className="flex gap-1">
          {(PRIORITIES as Priority[]).map((p) => (
            <button
              key={p}
              onClick={() => void editBlock(block.id, { priority: p })}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                block.priority === p
                  ? "bg-brand text-white"
                  : "bg-sunken text-muted hover:text-ink"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  block.priority === p ? "bg-white" : PRIORITY_META[p].dot
                }`}
              />
              {PRIORITY_META[p].label}
            </button>
          ))}
        </div>
      </div>

      {/* Note */}
      <div className="border-t border-edge px-4 py-2.5">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => void editBlock(block.id, { note: note.trim() || null })}
          rows={2}
          placeholder="What is this session for?"
          className="w-full resize-none rounded-md border border-edge bg-panel px-2 py-1.5 text-[11.5px] leading-relaxed text-ink outline-none placeholder:text-faint focus:border-brand focus:bg-canvas focus:ring-2 focus:ring-brand/15"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-edge bg-panel px-4 py-2.5">
        {client.link && (
          <a
            href={client.link}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium text-brand hover:bg-brand-soft"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            Open link
          </a>
        )}
        <button
          onClick={() => {
            void removeBlock(block.id);
            onClose();
          }}
          className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium text-danger hover:bg-danger/10"
        >
          <TrashIcon className="h-3.5 w-3.5" />
          Remove
        </button>
      </div>
    </div>
  );
}
