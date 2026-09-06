import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Where the magic link in the email lands. Exchanges the one-time token for a
 * session cookie, then forwards to the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/my-week";

  // Only allow same-site redirects, so a crafted link cannot bounce a freshly
  // authenticated user off to another domain.
  const destination = next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/my-week";

  if (!token_hash || !type) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("That link was incomplete. Request a new one.")}`
    );
  }

  const supabase = await getServerSupabase();
  if (!supabase) return NextResponse.redirect(`${origin}/my-week`);

  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        "That link has expired or was already used. Request a new one."
      )}`
    );
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
