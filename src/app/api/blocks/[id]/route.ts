import { NextRequest, NextResponse } from "next/server";
import { deleteBlock, updateBlock } from "@/lib/repo";
import { PRIORITIES } from "@/lib/types";
import { handle, badRequest, notFound } from "../../_util";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return badRequest("Body must be JSON.");

  if (body.date !== undefined && !DATE_RE.test(String(body.date))) {
    return badRequest("date must be YYYY-MM-DD.");
  }
  if (body.priority !== undefined && !PRIORITIES.includes(body.priority)) {
    return badRequest(`priority must be one of: ${PRIORITIES.join(", ")}`);
  }
  if (
    body.startMin !== undefined &&
    (!Number.isInteger(body.startMin) || body.startMin < 0 || body.startMin > 1439)
  ) {
    return badRequest("startMin must be an integer between 0 and 1439.");
  }
  if (
    body.durationMin !== undefined &&
    (!Number.isInteger(body.durationMin) ||
      body.durationMin < 15 ||
      body.durationMin > 1440)
  ) {
    return badRequest("durationMin must be an integer between 15 and 1440.");
  }

  const res = await handle(() => updateBlock(id, body));
  if (res.status !== 200) return res;
  const data = await res.json();
  return data ? NextResponse.json(data) : notFound("No such block.");
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const res = await handle(() => deleteBlock(id));
  if (res.status !== 200) return res;
  const ok = await res.json();
  return ok ? NextResponse.json({ ok: true }) : notFound("No such block.");
}
