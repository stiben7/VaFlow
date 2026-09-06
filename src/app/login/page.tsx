"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { GUEST_COOKIE, isSupabaseConfigured } from "@/lib/config";

const GUEST_MAX_AGE = 60 * 60 * 24 * 365; // a year

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/my-week";
  const linkError = params.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  function continueAsGuest() {
    // Middleware and the store both read this cookie to keep the visitor in
    // local mode. A full navigation so middleware sees it on the way in.
    document.cookie = `${GUEST_COOKIE}=1; path=/; max-age=${GUEST_MAX_AGE}; samesite=lax`;
    const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/my-week";
    window.location.href = dest;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase) {
      setError("Supabase is not configured for this deployment.");
      return;
    }

    setStatus("sending");
    setError(null);

    const redirect = new URL("/auth/confirm", window.location.origin);
    redirect.searchParams.set("next", next);

    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirect.toString() },
    });

    if (err) {
      setError(err.message);
      setStatus("idle");
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-panel px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-[15px] font-bold text-white">
            V
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight text-ink">
              VAFlow
            </div>
            <div className="text-[11.5px] text-faint">
              Your clients, your week.
            </div>
          </div>
        </div>

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
          ) : status === "sent" ? (
            <div>
              <h1 className="text-[14px] font-semibold text-ink">
                Check your email
              </h1>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                We sent a sign-in link to{" "}
                <span className="font-medium text-ink">{email}</span>. Open it on
                this device and you&apos;ll land straight in your week.
              </p>
              <button
                onClick={() => {
                  setStatus("idle");
                  setEmail("");
                }}
                className="mt-4 text-[12.5px] font-medium text-brand hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h1 className="text-[14px] font-semibold text-ink">Sign in</h1>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                We&apos;ll email you a link. No password to remember.
              </p>

              <label className="mt-4 block">
                <span className="mb-1 block text-[11.5px] font-medium text-muted">
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

              {(error || linkError) && (
                <p className="mt-2 text-[11.5px] leading-snug text-danger">
                  {error ?? linkError}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "sending" || !email.trim()}
                className="mt-4 w-full rounded-md bg-brand py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {status === "sending" ? "Sending..." : "Email me a link"}
              </button>
            </form>
          )}

          {isSupabaseConfigured && status !== "sent" && (
            <>
              <div className="my-4 flex items-center gap-2">
                <span className="h-px flex-1 bg-edge" />
                <span className="text-[10.5px] font-medium uppercase tracking-wide text-faint">
                  or
                </span>
                <span className="h-px flex-1 bg-edge" />
              </div>
              <button
                type="button"
                onClick={continueAsGuest}
                className="w-full rounded-md border border-edge bg-canvas py-2 text-[13px] font-medium text-ink transition-colors hover:bg-sunken"
              >
                Continue as guest
              </button>
              <p className="mt-2 text-[11px] leading-snug text-faint">
                No account. Your clients and schedule stay in this browser only
                &mdash; you can sign in later to sync them.
              </p>
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
