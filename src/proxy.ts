import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  GUEST_COOKIE,
  SUPABASE_KEY,
  SUPABASE_URL,
  isPublicPath,
  isSupabaseConfigured,
} from "@/lib/config";

/**
 * Refreshes the auth session on every request and gates the app behind a
 * sign-in.
 *
 * Two details here are load-bearing:
 *
 * 1. `setAll` receives a `headers` argument carrying no-store cache headers.
 *    They MUST be copied onto the response. Without them a CDN or reverse
 *    proxy can cache a response that sets auth cookies and hand one user's
 *    session to somebody else.
 *
 * 2. `getUser()` is called, not `getSession()`. `getSession()` trusts the
 *    cookie as-is; `getUser()` revalidates it against Supabase, so a forged
 *    or expired cookie cannot walk past this check.
 */
export async function proxy(request: NextRequest) {
  // No Supabase on this deployment -> no accounts, nothing to gate.
  if (!isSupabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A visitor who chose "continue as guest" carries this cookie. They get the
  // same access as a signed-in user; the store keeps their data in the browser.
  const isGuest = request.cookies.get(GUEST_COOKIE)?.value === "1";

  const { pathname } = request.nextUrl;

  if (!user && !isGuest && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Remember where they were headed so sign-in can land them back there.
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/my-week";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Auth cookies must be
     * refreshed on real page loads, not on every icon request.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
