"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { getSupabase } from "@/lib/supabase/client";
import type { EmailConfigInput, EmailProvider } from "@/lib/types";
import {
  CameraIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  LogoutIcon,
} from "./Icons";

const MIN_PASSWORD = 6;

const inputCls =
  "w-full rounded-md border border-edge bg-canvas px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/15";

/** "ven@smartvas.com" -> "VE". */
function initialsFor(email: string | null | undefined): string {
  if (!email) return "?";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase() || "?";
}

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const {
    user,
    profile,
    emailConfig,
    updateProfile,
    uploadAvatar,
    removeAvatar,
  } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwState, setPwState] = useState<"idle" | "saving" | "done">("idle");
  const [pwErr, setPwErr] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const email = user?.email ?? null;
  const avatar = profile?.avatarUrl ?? null;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarErr("Pick an image file.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setAvatarErr("Keep it under 3 MB.");
      return;
    }
    setAvatarErr(null);
    setUploading(true);
    try {
      await uploadAvatar(file);
    } catch (err) {
      setAvatarErr(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setPwErr(`At least ${MIN_PASSWORD} characters.`);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    setPwState("saving");
    setPwErr(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setPwErr(error.message);
      setPwState("idle");
      return;
    }
    setPassword("");
    setPwState("done");
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="pop-in w-full max-w-[400px] overflow-hidden rounded-xl border border-edge bg-canvas shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-edge px-5 py-3.5">
          <h2 id="settings-title" className="text-[14px] font-semibold text-ink">
            Settings
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

        <div className="space-y-4 px-5 py-4">
          {/* Profile photo */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-brand text-[16px] font-semibold text-white"
              title="Change photo"
            >
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="grid h-full w-full place-items-center">
                  {initialsFor(email)}
                </span>
              )}
              <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <CameraIcon className="h-5 w-5 text-white" />
              </span>
            </button>
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-[12.5px] font-medium text-brand hover:underline disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "Change photo"}
              </button>
              {avatar && !uploading && (
                <button
                  type="button"
                  onClick={() => void removeAvatar()}
                  className="ml-3 text-[12.5px] font-medium text-muted hover:text-ink"
                >
                  Remove
                </button>
              )}
              {avatarErr && (
                <p className="mt-0.5 text-[11px] text-danger">{avatarErr}</p>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onFile}
              className="hidden"
            />
          </div>

          {/* Email */}
          <div>
            <div className="mb-1 text-[11.5px] font-medium text-muted">Email</div>
            <div className="rounded-md border border-edge bg-panel px-2.5 py-2 text-[13px] text-ink">
              {email ?? "-"}
            </div>
          </div>

          {/* Password */}
          <form onSubmit={savePassword}>
            <div className="mb-1 text-[11.5px] font-medium text-muted">
              Password
            </div>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPwState("idle");
                  }}
                  placeholder="New password"
                  autoComplete="new-password"
                  className="w-full rounded-md border border-edge bg-canvas px-2.5 py-2 pr-8 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-ink"
                >
                  {showPw ? (
                    <EyeOffIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
              <button
                type="submit"
                disabled={pwState === "saving" || !password}
                className="shrink-0 rounded-md bg-brand px-3 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pwState === "saving" ? "Saving..." : "Update"}
              </button>
            </div>
            {pwErr && <p className="mt-1 text-[11px] text-danger">{pwErr}</p>}
            {pwState === "done" && (
              <p className="mt-1 text-[11px] text-muted">Password updated.</p>
            )}
          </form>

          {/* Email delivery */}
          <EmailDeliverySection />

          {/* Email reminders */}
          {profile && (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-edge px-2.5 py-2">
              <input
                type="checkbox"
                checked={profile.remindersEnabled}
                onChange={(e) =>
                  void updateProfile({ remindersEnabled: e.target.checked })
                }
                className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-brand)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium text-ink">
                  Email reminders
                </span>
                <span className="block text-[11px] leading-snug text-faint">
                  {emailConfig?.configured
                    ? `Tomorrow's clients each evening, today's an hour before the first — via ${emailConfig.provider}.`
                    : "Set up email delivery above to start receiving these."}
                  {profile.timezone
                    ? ` Timezone: ${profile.timezone}.`
                    : " Open the app on the device you use most so we can detect your timezone."}
                </span>
              </span>
            </label>
          )}
        </div>

        <footer className="border-t border-edge bg-panel px-5 py-3">
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-danger/40 bg-danger/5 py-2 text-[12.5px] font-medium text-danger transition-colors hover:bg-danger/10"
            >
              <LogoutIcon className="h-4 w-4" />
              Log out
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email delivery -- each VA's own sending provider.
// ---------------------------------------------------------------------------

function EmailDeliverySection() {
  const { emailConfig, saveEmailConfig, removeEmailConfig } = useStore();
  const [editing, setEditing] = useState(false);

  if (!emailConfig) return null;

  const cfg = emailConfig;

  return (
    <div className="rounded-md border border-edge px-2.5 py-2">
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
    <form onSubmit={submit} className="mt-2.5 space-y-2 border-t border-edge pt-2.5">
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
