import { NextResponse } from "next/server";
import { DbUnavailableError } from "@/lib/db";

/**
 * Wraps a route handler so a missing DATABASE_URL comes back as a readable 503
 * rather than an unhandled rejection. The client falls back to localStorage on
 * a 503, so this is the seam that makes "local mode" work without branching
 * the UI.
 */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn());
  } catch (err) {
    if (err instanceof DbUnavailableError) {
      return NextResponse.json(
        { error: err.message, code: "DB_UNAVAILABLE" },
        { status: 503 }
      );
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[api]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found"): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}
