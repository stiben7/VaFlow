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
import Select from "./Select";

type Enc = "ssl" | "starttls" | "none";

const inputCls =
  "w-full rounded-md border border-edge bg-canvas px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/15";

export default function EmailDeliverySection() {
  const { emailConfig, saveEmailConfig, removeEmailConfig, sendSampleReminders } =
    useStore();
  const [editing, setEditing] = useState(false);
  const [sample, setSample] = useState<"idle" | "sending">("idle");
  const [sampleMsg, setSampleMsg] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  if (!emailConfig) return null;

  const cfg = emailConfig;

  async function runSample() {
    setSample("sending");
    setSampleMsg(null);
    const r = await sendSampleReminders();
    setSample("idle");
    setSampleMsg(
      r.ok
        ? { ok: true, text: "Sent — check your inbox for two [Sample] emails." }
        : { ok: false, text: r.error ?? "Couldn't send the samples." }
    );
  }

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

      {cfg.configured && !editing && (
        <div className="mt-2.5 border-t border-edge pt-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runSample}
              disabled={sample === "sending"}
              className="rounded-md border border-edge px-2.5 py-1 text-[11px] font-medium text-muted hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sample === "sending" ? "Sending…" : "Send me a sample"}
            </button>
            <span className="text-[11px] leading-snug text-faint">
              Both digests (evening &amp; morning) to your own inbox now.
            </span>
          </div>
          {sampleMsg && (
            <p
              className={`mt-1.5 text-[11px] leading-snug ${
                sampleMsg.ok
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-danger"
              }`}
            >
              {sampleMsg.text}
            </p>
          )}
        </div>
      )}

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
  const [smtpPort, setSmtpPort] = useState(String(current.smtpPort ?? 465));
  const [smtpUser, setSmtpUser] = useState(current.smtpUser ?? "");

  // Encryption drives the port and the `secure` flag together so the two can't
  // disagree (a 587 + "TLS on" mismatch is the usual Gmail failure).
  const encFor = (port: number): Enc =>
    port === 587 ? "starttls" : port === 25 ? "none" : "ssl";
  const [enc, setEnc] = useState<Enc>(encFor(current.smtpPort ?? 465));

  function pickEnc(next: Enc) {
    setEnc(next);
    setSmtpPort(next === "ssl" ? "465" : next === "starttls" ? "587" : "25");
  }

  function fillGmail() {
    setSmtpHost("smtp.gmail.com");
    pickEnc("ssl");
  }

  const smtpSecure = enc === "ssl";

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

    // Gmail App Passwords are shown in four space-separated groups; the spaces
    // are cosmetic and SMTP AUTH rejects them.
    const isGmail = /(^|\.)gmail\.com$/i.test(smtpHost.trim());
    const cleanedSecret =
      provider === "smtp" && isGmail
        ? secret.replace(/\s+/g, "")
        : secret.trim();

    const input: EmailConfigInput = {
      provider,
      fromEmail: fromEmail.trim(),
      fromName: fromName.trim() || "VAFlow",
      secret: cleanedSecret,
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
      <Select
        value={provider}
        onChange={(e) => setProvider(e.target.value as EmailProvider)}
        fullWidth
        aria-label="Email provider"
      >
        <option value="resend">Resend (API key)</option>
        <option value="smtp">SMTP (host / port / login)</option>
      </Select>

      {provider === "smtp" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-faint">SMTP server</span>
            <button
              type="button"
              onClick={fillGmail}
              className="rounded-md border border-edge px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-sunken hover:text-ink"
            >
              Use Gmail
            </button>
          </div>

          <input
            value={smtpHost}
            onChange={(e) => setSmtpHost(e.target.value)}
            placeholder="smtp.gmail.com"
            className={inputCls}
          />

          <div className="grid grid-cols-2 gap-2">
            <Select
              value={enc}
              onChange={(e) => pickEnc(e.target.value as Enc)}
              fullWidth
              aria-label="Encryption"
            >
              <option value="ssl">SSL / TLS</option>
              <option value="starttls">STARTTLS</option>
              <option value="none">None</option>
            </Select>
            <input
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value.replace(/\D/g, ""))}
              placeholder="465"
              inputMode="numeric"
              aria-label="Port"
              className={inputCls}
            />
          </div>

          <input
            value={smtpUser}
            onChange={(e) => setSmtpUser(e.target.value)}
            placeholder="you@gmail.com"
            className={inputCls}
          />

          <p className="text-[11px] leading-snug text-faint">
            Gmail: <strong>SSL / TLS on port 465</strong>, and a{" "}
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noreferrer"
              className="text-brand hover:underline"
            >
              Google App Password
            </a>{" "}
            below (needs 2-Step Verification) — not your normal password.
          </p>
        </div>
      )}

      <div className="relative">
        <input
          type={showSecret ? "text" : "password"}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={
            provider === "resend"
              ? "Resend API key (re_...)"
              : "SMTP password / Gmail App Password"
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
