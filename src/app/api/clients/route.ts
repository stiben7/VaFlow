import { NextRequest, NextResponse } from "next/server";
import { createClient, listClients, seedClients } from "@/lib/repo";
import { SEED_CLIENTS } from "@/lib/seed";
import { TIERS } from "@/lib/types";
import { handle, badRequest } from "../_util";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => listClients());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return badRequest("Body must be JSON.");

  // POST /api/clients { seed: true } bootstraps the 26 accounts.
  if (body.seed === true) {
    return handle(async () => ({ inserted: await seedClients(SEED_CLIENTS) }));
  }

  const name = String(body.name ?? "").trim();
  if (!name) return badRequest("name is required.");

  const tier = body.tier ?? "Custom";
  if (!TIERS.includes(tier)) {
    return badRequest(`tier must be one of: ${TIERS.join(", ")}`);
  }

  const created = await handle(() =>
    createClient({
      name,
      tier,
      services: String(body.services ?? "").trim(),
      strategist: body.strategist ? String(body.strategist).trim() : null,
      basecampUrl: body.basecampUrl ? String(body.basecampUrl).trim() : null,
      colorKey: Number.isFinite(body.colorKey) ? Number(body.colorKey) : 0,
    })
  );
  if (created.status !== 200) return created;
  return NextResponse.json(await created.json(), { status: 201 });
}
