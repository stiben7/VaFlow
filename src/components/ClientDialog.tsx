"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { ACCENTS, SERVICE_BADGE_OFF, SERVICE_BADGE_ON, HEX_RE } from "@/lib/colors";
import { mergeServiceTags, type Client, type ServiceTag } from "@/lib/types";
import { CloseIcon, PlusIcon } from "./Icons";

/**
 * Add a new client, or -- when `client` is passed -- edit an existing one.
 * Same form either way; the only differences are the initial values, the
 * title/button copy, and add vs. patch on submit.
 */
export default function ClientDialog({
  client,
  onClose,
}: {
  client?: Client;
  onClose: () => void;
}) {
  const { addClient, editClient, clients, serviceTags: knownTags } = useStore();
  const editing = client != null;

  const [name, setName] = useState(client?.name ?? "");
  const [serviceTags, setServiceTags] = useState<ServiceTag[]>(
    client?.serviceTags ?? []
  );
  const [newTag, setNewTag] = useState("");
  const [strategist, setStrategist] = useState(client?.strategist ?? "");
  const [basecampUrl, setBasecampUrl] = useState(client?.basecampUrl ?? "");
  const [services, setServices] = useState(client?.services ?? "");
  const [colorKey, setColorKey] = useState<number>(() => {
    if (client) return ((client.colorKey % 8) + 8) % 8;
    const counts = new Array(8).fill(0);
    for (const c of clients) counts[((c.colorKey % 8) + 8) % 8] += 1;
    let best = 0;
    for (let i = 1; i < 8; i += 1) if (counts[i] < counts[best]) best = i;
    return best;
  });
  // `hexDraft` is whatever is in the text box; `customMode` says the custom
  // colour (not a preset) is the active one. The client's `color` is the draft
  // only when it is a complete, valid hex.
  const [hexDraft, setHexDraft] = useState(client?.color ?? "#4f46e5");
  const [customMode, setCustomMode] = useState(
    Boolean(client?.color && HEX_RE.test(client.color))
  );
  const [saving, setSaving] = useState(false);

  const validHex = HEX_RE.test(hexDraft);
  const customColor = customMode && validHex ? hexDraft : null;

  const toggleTag = (t: ServiceTag) =>
    setServiceTags((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]
    );

  // Every label to show as a chip: the known ones plus any this client already
  // carries, plus one being typed.
  const tagChoices = mergeServiceTags([knownTags, serviceTags]);

  function addTag() {
    const t = newTag.trim().slice(0, 40);
    setNewTag("");
    if (!t) return;
    setServiceTags((cur) => (cur.includes(t) ? cur : [...cur, t]));
  }

  function applyHex(value: string) {
    setHexDraft(value.startsWith("#") ? value : `#${value}`);
    setCustomMode(true);
  }

  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const duplicate = clients.some(
    (c) =>
      c.id !== client?.id &&
      c.name.trim().toLowerCase() === name.trim().toLowerCase()
  );
  const canSave = name.trim().length > 0 && !duplicate && !saving;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    const patch = {
      name: name.trim(),
      serviceTags,
      services: services.trim(),
      strategist: strategist.trim() || null,
      basecampUrl: basecampUrl.trim() || null,
      colorKey,
      color: customColor,
    };
    if (editing) await editClient(client.id, patch);
    else await addClient(patch);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-dialog-title"
        className="pop-in w-full max-w-[460px] overflow-hidden rounded-xl border border-edge bg-canvas shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-edge px-5 py-3.5">
          <h2
            id="client-dialog-title"
            className="text-[14px] font-semibold text-ink"
          >
            {editing ? "Edit client" : "Add client"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-faint hover:bg-sunken hover:text-ink"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="space-y-3.5 px-5 py-4">
          <Field label="Account name" required>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rosewood Bridal"
              className={input}
            />
            {duplicate && (
              <p className="mt-1 text-[11.5px] text-danger">
                An account with that name already exists.
              </p>
            )}
          </Field>

          <Field label="Availed services">
            <div className="flex flex-wrap gap-1.5">
              {tagChoices.map((t) => {
                const on = serviceTags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleTag(t)}
                    className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                      on
                        ? SERVICE_BADGE_ON
                        : `${SERVICE_BADGE_OFF} hover:text-ink`
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add a service..."
                maxLength={40}
                className="min-w-0 flex-1 rounded-md border border-edge bg-canvas px-2 py-1 text-[11.5px] text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
              <button
                type="button"
                onClick={addTag}
                disabled={!newTag.trim()}
                className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-[11.5px] font-medium text-muted transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <PlusIcon />
                Add
              </button>
            </div>
          </Field>

          <Field label="Colour">
            <div className="flex flex-wrap items-center gap-1.5">
              {ACCENTS.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setColorKey(i);
                    setCustomMode(false);
                  }}
                  aria-label={`Colour ${i + 1}`}
                  className={`h-6 w-6 rounded-full ${a.dot} transition-transform ${
                    !customMode && colorKey === i
                      ? "scale-110 ring-2 ring-ink ring-offset-2 ring-offset-[var(--color-canvas)]"
                      : "hover:scale-105"
                  }`}
                />
              ))}

              {/* Custom hex */}
              <span className="mx-0.5 h-5 w-px bg-edge" aria-hidden />
              <label
                onClick={() => setCustomMode(true)}
                className={`relative h-6 w-6 shrink-0 cursor-pointer rounded-full transition-transform ${
                  customMode
                    ? "scale-110 ring-2 ring-ink ring-offset-2 ring-offset-[var(--color-canvas)]"
                    : "hover:scale-105"
                }`}
                style={{
                  background:
                    customMode && validHex
                      ? hexDraft
                      : "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)",
                }}
                title="Custom colour"
              >
                <input
                  type="color"
                  value={validHex ? hexDraft : "#4f46e5"}
                  onChange={(e) => applyHex(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <input
                value={hexDraft}
                onChange={(e) => applyHex(e.target.value)}
                onFocus={() => setCustomMode(true)}
                placeholder="#4f46e5"
                spellCheck={false}
                className={`w-[86px] rounded-md border bg-canvas px-2 py-1 font-mono text-[11.5px] text-ink outline-none placeholder:text-faint focus:ring-2 focus:ring-brand/15 ${
                  customMode && !validHex
                    ? "border-danger"
                    : "border-edge focus:border-brand"
                }`}
              />
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Account strategist">
              <input
                value={strategist}
                onChange={(e) => setStrategist(e.target.value)}
                placeholder="Courtney"
                className={input}
              />
            </Field>
            <Field label="Basecamp URL">
              <input
                value={basecampUrl}
                onChange={(e) => setBasecampUrl(e.target.value)}
                placeholder="https://app.basecamp.com/..."
                className={input}
              />
            </Field>
          </div>

          <Field label="Deliverables">
            <textarea
              value={services}
              onChange={(e) => setServices(e.target.value)}
              rows={3}
              placeholder="Enhanced Local SEO, 2 blogs per month, monthly strategy call..."
              className={`${input} resize-none leading-relaxed`}
            />
          </Field>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-edge bg-panel px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[12.5px] font-medium text-muted hover:bg-sunken hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-md bg-brand px-3.5 py-1.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving
              ? editing
                ? "Saving..."
                : "Adding..."
              : editing
                ? "Save changes"
                : "Add client"}
          </button>
        </footer>
      </form>
    </div>
  );
}

const input =
  "w-full rounded-md border border-edge bg-canvas px-2.5 py-[7px] text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/15";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-medium text-muted">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}
