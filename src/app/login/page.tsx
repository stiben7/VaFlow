"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { GUEST_COOKIE, isSupabaseConfigured } from "@/lib/config";
import Logo from "@/components/Logo";
import {
  MailIcon,
  LockIcon,
  UserIcon,
  EnterDoorIcon,
  EyeIcon,
  EyeOffIcon,
} from "@/components/Icons";

const GUEST_MAX_AGE = 60 * 60 * 24 * 365; // a year
const MIN_PASSWORD = 6; // Supabase's default floor

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

type Mode = "signin" | "signup";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/my-week";
  const linkError = params.get("error");

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/my-week";

  function continueAsGuest() {
    // Middleware and the store both read this cookie to keep the visitor in
    // local mode. A full navigation so middleware sees it on the way in.
    document.cookie = `${GUEST_COOKIE}=1; path=/; max-age=${GUEST_MAX_AGE}; samesite=lax`;
    window.location.href = dest;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase) {
      setError("Supabase is not configured for this deployment.");
      return;
    }

    const mail = email.trim();
    if (mode === "signup" && password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === "signup") {
      const { data, error: err } = await supabase.auth.signUp({
        email: mail,
        password,
      });
      if (err) {
        setError(err.message);
        setBusy(false);
        return;
      }
      // With email confirmation off, sign-up returns a live session and we can
      // go straight in. If it is ever turned on, there is no session yet.
      if (!data.session) {
        setNotice(
          "Account created. Check your email to confirm it, then sign in."
        );
        setMode("signin");
        setPassword("");
        setBusy(false);
        return;
      }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: mail,
        password,
      });
      if (err) {
        setError(err.message);
        setBusy(false);
        return;
      }
    }

    // Session cookies are set. Full navigation so the middleware sees them.
    window.location.href = dest;
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-panel px-4">
      <div className="w-full max-w-[380px]">
        <Logo className="mx-auto mb-10 h-7 w-auto text-ink" />

        <div className="rounded-xl border border-edge bg-canvas p-6 shadow-sm">
          {!isSupabaseConfigured ? (
            <div className="text-[12.5px] leading-relaxed text-muted">
              This deployment is running in local mode, so there is no sign-in.
              Everything is saved in this browser.{" "}
              <a href="/my-week" className="font-medium text-brand hover:underline">
                Open My Week
              </a>
              .
            </div>
          ) : (
            <>
              <form onSubmit={submit}>
                <h1 className="text-center text-[20px] font-semibold tracking-tight text-ink">
                  {mode === "signup" ? "Create your account" : "Sign in"}
                </h1>
                {mode === "signup" && (
                  <p className="mt-1 text-center text-[12.5px] leading-relaxed text-muted">
                    Your clients and schedule are saved to your account.
                  </p>
                )}

                <label className="mt-5 block">
                  <span className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium text-muted">
                    <MailIcon className="h-3.5 w-3.5" />
                    Email
                  </span>
                  <input
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full rounded-md border border-edge bg-canvas px-2.5 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/15"
                  />
                </label>

                <label className="mt-3 block">
                  <span className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium text-muted">
                    <LockIcon className="h-3.5 w-3.5" />
                    Password
                  </span>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      required
                      minLength={MIN_PASSWORD}
                      autoComplete={
                        mode === "signup" ? "new-password" : "current-password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        mode === "signup"
                          ? `At least ${MIN_PASSWORD} characters`
                          : "Your password"
                      }
                      className="w-full rounded-md border border-edge bg-canvas px-2.5 py-2 pr-9 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/15"
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
                </label>

                {(error || linkError) && (
                  <p className="mt-2 text-[11.5px] leading-snug text-danger">
                    {error ?? linkError}
                  </p>
                )}
                {notice && (
                  <p className="mt-2 text-[11.5px] leading-snug text-muted">
                    {notice}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy || !email.trim() || !password}
                  className="mt-4 flex w-full items-center justify-between rounded-md bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>
                    {busy
                      ? "Working..."
                      : mode === "signup"
                        ? "Create account"
                        : "Sign in"}
                  </span>
                  <EnterDoorIcon className="h-4 w-6" />
                </button>
              </form>

              {mode === "signup" ? (
                <p className="mt-3 text-center text-[12px] text-muted">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setError(null);
                      setNotice(null);
                    }}
                    className="font-medium text-brand hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={continueAsGuest}
                    className="mt-3 flex w-full items-center justify-between rounded-md border border-edge bg-canvas px-3.5 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-sunken"
                  >
                    <span>Continue as guest</span>
                    <UserIcon className="h-4 w-4" />
                  </button>
                  <p className="mt-2 text-[11px] leading-snug text-faint">
                    No account. Your clients and schedule stay in this browser
                    only. You can sign in later to sync them.
                  </p>

                  <div className="my-4 flex items-center gap-2">
                    <span className="h-px flex-1 bg-edge" />
                    <span className="text-[10.5px] font-medium uppercase tracking-wide text-faint">
                      or
                    </span>
                    <span className="h-px flex-1 bg-edge" />
                  </div>

                  <p className="text-center text-[12px] text-muted">
                    New here?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signup");
                        setError(null);
                        setNotice(null);
                      }}
                      className="font-medium text-brand hover:underline"
                    >
                      Sign up
                    </button>
                  </p>
                </>
              )}
            </>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-faint">
          Your clients and your schedule are private to your account.
        </p>
      </div>
    </div>
  );
}
