"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { getSupabase } from "@/lib/supabase/client";
import {
  CameraIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  LogoutIcon,
} from "./Icons";

const MIN_PASSWORD = 6;

/** "ven@smartvas.com" -> "VE". */
function initialsFor(email: string | null | undefined): string {
  if (!email) return "?";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase() || "?";
}

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { user, profile, updateProfile, uploadAvatar, removeAvatar } =
    useStore();
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
                  {profile.timezone
                    ? `Tomorrow's clients each evening, and today's an hour before the first. Timezone: ${profile.timezone}`
                    : "Open the app on the device you use most so we can detect your timezone."}
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
