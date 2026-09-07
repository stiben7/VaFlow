"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { getSupabase } from "@/lib/supabase/client";
import EmailDeliverySection from "@/components/EmailDeliverySection";
import Select from "@/components/Select";
import Avatar from "@/components/Avatar";
import { CameraIcon, EyeIcon, EyeOffIcon } from "@/components/Icons";

const MIN_PASSWORD = 6;

const inputCls =
  "w-full rounded-md border border-edge bg-canvas px-2.5 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/15";

/** "ven@smartvas.com" -> "VE". */
function initialsFor(email: string | null | undefined): string {
  if (!email) return "?";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase() || "?";
}

export default function SettingsPage() {
  const { user, profile, mode, updateProfile, uploadAvatar, removeAvatar } =
    useStore();

  // Client component -- jump to the section named in the URL hash once mounted.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ block: "start" });
  }, []);

  if (mode !== "cloud") {
    return (
      <>
        <PageHeader />
        <div className="grid flex-1 place-items-center px-5 py-20 text-center">
          <div>
            <p className="text-[13px] text-muted">
              Sign in to manage your account settings.
            </p>
            <Link
              href="/login"
              className="mt-3 inline-block rounded-md bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white hover:opacity-90"
            >
              Sign in
            </Link>
          </div>
        </div>
      </>
    );
  }

  const email = user?.email ?? null;

  return (
    <>
      <PageHeader />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-lg space-y-8">
          <ProfileSection
            email={email}
            avatar={profile?.avatarUrl ?? null}
            animateAvatar={profile?.animateAvatar ?? true}
            uploadAvatar={uploadAvatar}
            removeAvatar={removeAvatar}
            updateProfile={updateProfile}
          />
          <AccountSection email={email} />
          <DeliverySection
            profile={profile}
            updateProfile={updateProfile}
          />
        </div>
      </div>
    </>
  );
}

function PageHeader() {
  return (
    <header className="flex shrink-0 flex-col gap-0.5 border-b border-edge bg-canvas px-5 py-3">
      <h1 className="text-[15px] font-semibold tracking-tight text-ink">
        Settings
      </h1>
      <p className="text-[11px] text-faint">Your profile, sign-in and email delivery</p>
    </header>
  );
}

function SectionShell({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4">
      <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
      {description && (
        <p className="mt-0.5 text-[11.5px] leading-snug text-faint">
          {description}
        </p>
      )}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Profile photo
// ---------------------------------------------------------------------------

function ProfileSection({
  email,
  avatar,
  animateAvatar,
  uploadAvatar,
  removeAvatar,
  updateProfile,
}: {
  email: string | null;
  avatar: string | null;
  animateAvatar: boolean;
  uploadAvatar: (file: File) => Promise<void>;
  removeAvatar: () => Promise<void>;
  updateProfile: ReturnType<typeof useStore>["updateProfile"];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isGif = !!avatar && /\.gif(\?|$)/i.test(avatar);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr("Pick an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr("Keep it under 5 MB.");
      return;
    }
    setErr(null);
    setUploading(true);
    try {
      await uploadAvatar(file);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <SectionShell id="profile" title="Profile photo">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full"
          title="Change photo"
        >
          <Avatar
            src={avatar}
            initials={initialsFor(email)}
            animate={animateAvatar}
            className="h-16 w-16 text-[18px]"
          />
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
            {uploading ? "Uploading…" : "Change photo"}
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
          {err && <p className="mt-0.5 text-[11px] text-danger">{err}</p>}
          <p className="mt-0.5 text-[11px] text-faint">
            JPG, PNG or GIF, under 5 MB.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onFile}
          className="hidden"
        />
      </div>

      {isGif && (
        <label className="flex items-center justify-between gap-2 rounded-md border border-edge px-3 py-2.5">
          <span className="min-w-0">
            <span className="block text-[12.5px] font-medium text-ink">
              Play animated avatar
            </span>
            <span className="block text-[11px] leading-snug text-faint">
              Turning this off freezes your GIF to its first frame everywhere,
              which is lighter on a busy sidebar.
            </span>
          </span>
          <input
            type="checkbox"
            checked={animateAvatar}
            onChange={(e) =>
              void updateProfile({ animateAvatar: e.target.checked })
            }
            className="h-3.5 w-3.5 shrink-0 accent-[var(--color-brand)]"
          />
        </label>
      )}
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Account -- email + password
// ---------------------------------------------------------------------------

function AccountSection({ email }: { email: string | null }) {
  const [newEmail, setNewEmail] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "saving" | "done">(
    "idle"
  );
  const [emailErr, setEmailErr] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwState, setPwState] = useState<"idle" | "saving" | "done">("idle");
  const [pwErr, setPwErr] = useState<string | null>(null);

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    const target = newEmail.trim();
    if (!target || target === email) {
      setEmailErr("Enter a different address.");
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    setEmailState("saving");
    setEmailErr(null);
    const { error } = await supabase.auth.updateUser({ email: target });
    if (error) {
      setEmailErr(error.message);
      setEmailState("idle");
      return;
    }
    setNewEmail("");
    setEmailState("done");
  }

  async function changePassword(e: React.FormEvent) {
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
    <SectionShell
      id="email"
      title="Account"
      description="Changing your email sends a confirmation link to the new address. Delivery uses the built-in sender and can be slow or rate-limited."
    >
      <div>
        <div className="mb-1 text-[11.5px] font-medium text-muted">
          Current email
        </div>
        <div className="rounded-md border border-edge bg-panel px-2.5 py-2 text-[13px] text-ink">
          {email ?? "Not set"}
        </div>
      </div>

      <form onSubmit={changeEmail} className="space-y-1.5">
        <div className="text-[11.5px] font-medium text-muted">Change email</div>
        <div className="flex gap-1.5">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              setEmailState("idle");
            }}
            placeholder="new@address.com"
            autoComplete="email"
            className={inputCls}
          />
          <button
            type="submit"
            disabled={emailState === "saving" || !newEmail}
            className="shrink-0 rounded-md bg-brand px-3 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {emailState === "saving" ? "Sending…" : "Update"}
          </button>
        </div>
        {emailErr && <p className="text-[11px] text-danger">{emailErr}</p>}
        {emailState === "done" && (
          <p className="text-[11px] text-muted">
            Check the new address for a confirmation link.
          </p>
        )}
      </form>

      <form onSubmit={changePassword} className="space-y-1.5">
        <div className="text-[11.5px] font-medium text-muted">Password</div>
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
              className={`${inputCls} pr-8`}
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
            {pwState === "saving" ? "Saving…" : "Update"}
          </button>
        </div>
        {pwErr && <p className="text-[11px] text-danger">{pwErr}</p>}
        {pwState === "done" && (
          <p className="text-[11px] text-muted">Password updated.</p>
        )}
      </form>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Email delivery + reminders
// ---------------------------------------------------------------------------

function DeliverySection({
  profile,
  updateProfile,
}: {
  profile: ReturnType<typeof useStore>["profile"];
  updateProfile: ReturnType<typeof useStore>["updateProfile"];
}) {
  return (
    <SectionShell
      id="delivery"
      title="Email delivery"
      description="Reminder emails send through your own provider so nothing is tied to ours."
    >
      <EmailDeliverySection />

      {profile && (
        <>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-edge px-3 py-2.5">
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
                Tomorrow&apos;s clients each evening, today&apos;s an hour before
                the first block.
                {profile.timezone
                  ? ` Timezone: ${profile.timezone}.`
                  : " Open the app on the device you use most so we can detect your timezone."}
              </span>
            </span>
          </label>

          <label className="flex items-center justify-between gap-2 rounded-md border border-edge px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium text-ink">
                Evening digest hour
              </span>
              <span className="block text-[11px] leading-snug text-faint">
                Local time the &ldquo;tomorrow&rdquo; email goes out.
              </span>
            </span>
            <Select
              value={profile.digestHour}
              onChange={(e) =>
                void updateProfile({ digestHour: Number(e.target.value) })
              }
              className="shrink-0"
              aria-label="Evening digest hour"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {h.toString().padStart(2, "0")}:00
                </option>
              ))}
            </Select>
          </label>
        </>
      )}
    </SectionShell>
  );
}
