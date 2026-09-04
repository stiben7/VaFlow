import { NextRequest, NextResponse } from "next/server";
import { createBlock, listBlocks } from "@/lib/repo";
import { PRIORITIES } from "@/lib/types";
import { handle, badRequest } from "../_util";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") ?? undefined;
  const to = req.nextUrl.searchParams.get("to") ?? undefined;
  if (from && !DATE_RE.test(from)) return badRequest("from must be YYYY-MM-DD.");
  if (to && !DATE_RE.test(to)) return badRequest("to must be YYYY-MM-DD.");
  return handle(() => listBlocks(from, to));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return badRequest("Body must be JSON.");

  const clientId = String(body.clientId ?? "");
  if (!clientId) return badRequest("clientId is required.");

  const date = String(body.date ?? "");
  if (!DATE_RE.test(date)) return badRequest("date must be YYYY-MM-DD.");

  const startMin = Number(body.startMin);
  if (!Number.isInteger(startMin) || startMin < 0 || startMin > 1439) {
    return badRequest("startMin must be an integer between 0 and 1439.");
  }

  const durationMin = Number(body.durationMin ?? 60);
  if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 1440) {
    return badRequest("durationMin must be an integer between 15 and 1440.");
  }

  const priority = body.priority ?? "normal";
  if (!PRIORITIES.includes(priority)) {
    return badRequest(`priority must be one of: ${PRIORITIES.join(", ")}`);
  }

  const res = await handle(() =>
    createBlock({
      clientId,
      date,
      startMin,
      durationMin,
      priority,
      note: body.note ? String(body.note) : null,
    })
  );
  if (res.status !== 200) return res;
  return NextResponse.json(await res.json(), { status: 201 });
}
