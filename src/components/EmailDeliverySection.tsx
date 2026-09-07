"use client";

/**
 * Each VA brings their own email sending provider (Resend API key or generic
 * SMTP). The secret never lives in the browser -- it is posted to the
 * `email-config` Edge Function, which validates, encrypts, stores and
 * test-sends it. Lifted out of the old Settings modal so the Settings page can
 * render it on its own.
 */

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { EmailConfigInput, EmailProvider } from "@/lib/types";
import { EyeIcon, EyeOffIcon } from "./Icons";

const inputCls =
  "w-full rounded-md border border-edge bg-canvas px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/15";

export default function EmailDeliverySection() {
  const { emailConfig, saveEmailConfig, removeEmailConfig } = useStore();
  const [editing, setEditing] = useState(false);

  if (!emailConfig) return null;

  const cfg = emailConfig;

  return (
    <div className="rounded-md border border-edge px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-medium text-ink">
            Email delivery
          </span>
          {!cfg.configured ? (
            <span className="block text-[11px] leading-snug text-faint">
              Not set up. Reminders need your own SMTP or Resend account.
            </span>
          ) : cfg.verifiedAt && !cfg.lastError ? (
            <span className="block text-[11px] leading-snug text-emerald-600 dark:text-emerald-400">
              Verified &middot; {cfg.provider} &middot; {cfg.fromEmail}
            </span>
          ) : cfg.lastError ? (
            <span className="block text-[11px] leading-snug text-amber-600 dark:text-amber-400">
              {cfg.provider} &middot; last send failed: {cfg.lastError}
            </span>
          ) : (
            <span className="block text-[11px] leading-snug text-faint">
              {cfg.provider} &middot; {cfg.fromEmail} &middot; not yet verified
            </span>
          )}
        </span>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-md border border-edge px-2 py-1 text-[11px] font-medium text-muted hover:bg-sunken hover:text-ink"
          >
            {cfg.configured ? "Edit" : "Set up"}
          </button>
        )}
      </div>

      {editing && (
        <EmailDeliveryForm
          current={cfg}
          onDone={() => setEditing(false)}
          onSave={saveEmailConfig}
          onRemove={async () => {
            await removeEmailConfig();
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function EmailDeliveryForm({
  current,
  onDone,
  onSave,
  onRemove,
}: {
  current: NonNullable<ReturnType<typeof useStore>["emailConfig"]>;
  onDone: () => void;
  onSave: (
    input: EmailConfigInput
  ) => Promise<{ verified: boolean; error?: string }>;
  onRemove: () => Promise<void>;
}) {
  const [provider, setProvider] = useState<EmailProvider>(
    current.provider ?? "resend"
  );
  const [fromEmail, setFromEmail] = useState(current.fromEmail ?? "");
  const [fromName, setFromName] = useState(current.fromName ?? "VAFlow");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [smtpHost, setSmtpHost] = useState(current.smtpHost ?? "");
  const [smtpPort, setSmtpPort] = useState(String(current.smtpPort ?? 587));
  const [smtpUser, setSmtpUser] = useState(current.smtpUser ?? "");
  const [smtpSecure, setSmtpSecure] = useState(current.smtpSecure);

  const [state, setState] = useState<"idle" | "saving">("idle");
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(
    null
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!secret.trim()) {
      setResult({ ok: false, msg: "Enter the API key / password." });
      return;
    }
    setState("saving");
    setResult(null);
    const input: EmailConfigInput = {
      provider,
      fromEmail: fromEmail.trim(),
      fromName: fromName.trim() || "VAFlow",
      secret: secret.trim(),
      ...(provider === "smtp"
        ? {
            smtp: {
              host: smtpHost.trim(),
              port: Number(smtpPort) || 0,
              user: smtpUser.trim(),
              secure: smtpSecure,
            },
          }
        : {}),
    };
    const r = await onSave(input);
    setState("idle");
    if (r.verified) {
      setResult({ ok: true, msg: "Test email sent. You're all set." });
      setSecret("");
      setTimeout(onDone, 1200);
    } else {
      setResult({
        ok: false,
        msg: r.error ?? "Saved, but the test send failed.",
      });
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 border-t border-edge pt-3">
      <select
        value={provider}
        onChange={(e) => setProvider(e.target.value as EmailProvider)}
        className={inputCls}
      >
        <option value="resend">Resend (API key)</option>
        <option value="smtp">SMTP (host / port / login)</option>
      </select>

      {provider === "smtp" && (
        <div className="grid grid-cols-3 gap-2">
          <input
            value={smtpHost}
            onChange={(e) => setSmtpHost(e.target.value)}
            placeholder="smtp.host.com"
            className={`col-span-2 ${inputCls}`}
          />
          <input
            value={smtpPort}
            onChange={(e) => setSmtpPort(e.target.value.replace(/\D/g, ""))}
            placeholder="587"
            inputMode="numeric"
            className={inputCls}
          />
          <input
            value={smtpUser}
            onChange={(e) => setSmtpUser(e.target.value)}
            placeholder="username"
            className={`col-span-3 ${inputCls}`}
          />
          <label className="col-span-3 flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={smtpSecure}
              onChange={(e) => setSmtpSecure(e.target.checked)}
              className="h-3 w-3 accent-[var(--color-brand)]"
            />
            Use TLS (port 465). Off = STARTTLS (587).
          </label>
        </div>
      )}

      <div className="relative">
        <input
          type={showSecret ? "text" : "password"}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={
            provider === "resend" ? "Resend API key (re_...)" : "SMTP password"
          }
          autoComplete="off"
          className={`${inputCls} pr-8`}
        />
        <button
          type="button"
          onClick={() => setShowSecret((s) => !s)}
          aria-label={showSecret ? "Hide" : "Show"}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-ink"
        >
          {showSecret ? (
            <EyeOffIcon className="h-3.5 w-3.5" />
          ) : (
            <EyeIcon className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          value={fromEmail}
          onChange={(e) => setFromEmail(e.target.value)}
          placeholder="reminders@you.com"
          type="email"
          required
          className={inputCls}
        />
        <input
          value={fromName}
          onChange={(e) => setFromName(e.target.value)}
          placeholder="From name"
          className={inputCls}
        />
      </div>

      {result && (
        <p
          className={`text-[11px] leading-snug ${
            result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-danger"
          }`}
        >
          {result.msg}
        </p>
      )}

      <div className="flex items-center gap-1.5">
        <button
          type="submit"
          disabled={state === "saving"}
          className="rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state === "saving" ? "Testing…" : "Save & send test"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-sunken hover:text-ink"
        >
          Cancel
        </button>
        {current.configured && (
          <button
            type="button"
            onClick={() => void onRemove()}
            className="ml-auto rounded-md px-2.5 py-1.5 text-[12px] font-medium text-danger hover:bg-danger/10"
          >
            Remove
          </button>
        )}
      </div>
    </form>
  );
}
