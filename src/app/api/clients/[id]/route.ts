import { NextRequest, NextResponse } from "next/server";
import { deleteClient, updateClient } from "@/lib/repo";
import { TIERS } from "@/lib/types";
import { handle, badRequest, notFound } from "../../_util";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return badRequest("Body must be JSON.");
  if (body.tier && !TIERS.includes(body.tier)) {
    return badRequest(`tier must be one of: ${TIERS.join(", ")}`);
  }

  const res = await handle(() => updateClient(id, body));
  if (res.status !== 200) return res;
  const data = await res.json();
  return data ? NextResponse.json(data) : notFound("No such client.");
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const res = await handle(() => deleteClient(id));
  if (res.status !== 200) return res;
  const ok = await res.json();
  return ok ? NextResponse.json({ ok: true }) : notFound("No such client.");
}
