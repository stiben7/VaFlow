"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { ACCENTS, TIER_BADGE, TIER_SHORT } from "@/lib/colors";
import { TIERS, type Tier } from "@/lib/types";
import { CloseIcon } from "./Icons";

export default function AddClientDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const { addClient, clients } = useStore();
  const [name, setName] = useState("");
  const [tier, setTier] = useState<Tier>("Accelerated Growth");
  const [strategist, setStrategist] = useState("");
  const [basecampUrl, setBasecampUrl] = useState("");
  const [services, setServices] = useState("");
  const [colorKey, setColorKey] = useState<number>(() => {
    const counts = new Array(8).fill(0);
    for (const c of clients) counts[((c.colorKey % 8) + 8) % 8] += 1;
    let best = 0;
    for (let i = 1; i < 8; i += 1) if (counts[i] < counts[best]) best = i;
    return best;
  });
  const [saving, setSaving] = useState(false);

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
    (c) => c.name.trim().toLowerCase() === name.trim().toLowerCase()
  );
  const canSave = name.trim().length > 0 && !duplicate && !saving;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    await addClient({
      name: name.trim(),
      tier,
      services: services.trim(),
      strategist: strategist.trim() || null,
      basecampUrl: basecampUrl.trim() || null,
      colorKey,
    });
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
        aria-labelledby="add-client-title"
        className="pop-in w-full max-w-[460px] overflow-hidden rounded-xl border border-edge bg-canvas shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-edge px-5 py-3.5">
          <h2 id="add-client-title" className="text-[14px] font-semibold text-ink">
            Add client
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

          <Field label="Package">
            <div className="flex flex-wrap gap-1.5">
              {(TIERS as Tier[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-all ${
                    tier === t
                      ? "bg-brand text-white"
                      : `${TIER_BADGE[t]} opacity-70 hover:opacity-100`
                  }`}
                >
                  {TIER_SHORT[t]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Colour">
            <div className="flex gap-1.5">
              {ACCENTS.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setColorKey(i)}
                  aria-label={`Colour ${i + 1}`}
                  className={`h-6 w-6 rounded-full ${a.dot} transition-transform ${
                    colorKey === i
                      ? "scale-110 ring-2 ring-ink ring-offset-2 ring-offset-[var(--color-canvas)]"
                      : "hover:scale-105"
                  }`}
                />
              ))}
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
            {saving ? "Adding..." : "Add client"}
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
