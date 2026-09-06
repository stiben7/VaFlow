import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";
import { GUEST_COOKIE } from "@/lib/config";

/**
 * Where the magic link in the email lands. Exchanges the one-time credential
 * for a session cookie, then forwards to the app.
 *
 * Handles both shapes Supabase can send, so this works whether or not the
 * email template has been customised:
 *
 *   - `?token_hash=...&type=...`  the token-hash template (Supabase's
 *     recommended SSR flow).
 *   - `?code=...`                 the default `{{ .ConfirmationURL }}`
 *     template under the PKCE flow, which redirects here with an auth code.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/my-week";

  // Only allow same-site redirects, so a crafted link cannot bounce a freshly
  // authenticated user off to another domain.
  const destination = next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/my-week";

  const badLink = `${origin}/login?error=${encodeURIComponent(
    "That link has expired or was already used. Request a new one."
  )}`;

  if (!code && (!token_hash || !type)) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("That link was incomplete. Request a new one.")}`
    );
  }

  const supabase = await getServerSupabase();
  if (!supabase) return NextResponse.redirect(`${origin}/my-week`);

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ type: type!, token_hash: token_hash! });

  if (error) return NextResponse.redirect(badLink);

  // They have a real session now -- drop the guest cookie so the middleware
  // and store stop treating them as a guest.
  (await cookies()).delete(GUEST_COOKIE);

  return NextResponse.redirect(`${origin}${destination}`);
}
