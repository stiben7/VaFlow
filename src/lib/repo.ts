import { query } from "./db";
import type { Block, Client, NewBlock, NewClient, Priority, Tier } from "./types";
import { toKey } from "./date";

/**
 * Server-side data access. Every statement is plain parameterised SQL with no
 * Postgres-only syntax beyond ON CONFLICT, so the Oracle port is a find/replace
 * in this one file rather than a rewrite.
 */

type ClientRow = {
  id: string;
  name: string;
  tier: string;
  services: string;
  strategist: string | null;
  basecamp_url: string | null;
  color_key: number;
  archived: boolean;
};

type BlockRow = {
  id: string;
  client_id: string;
  day: Date | string;
  start_min: number;
  duration_min: number;
  priority: string;
  note: string | null;
};

function toClient(r: ClientRow): Client {
  return {
    id: r.id,
    name: r.name,
    tier: r.tier as Tier,
    services: r.services,
    strategist: r.strategist,
    basecampUrl: r.basecamp_url,
    colorKey: Number(r.color_key),
    archived: Boolean(r.archived),
  };
}

function toBlock(r: BlockRow): Block {
  // node-postgres hands back a JS Date for DATE columns, constructed in the
  // server's local zone. toKey() reads local fields, so this round-trips
  // correctly; using toISOString() here would silently shift the day.
  const day = r.day instanceof Date ? toKey(r.day) : String(r.day).slice(0, 10);
  return {
    id: r.id,
    clientId: r.client_id,
    date: day,
    startMin: Number(r.start_min),
    durationMin: Number(r.duration_min),
    priority: r.priority as Priority,
    note: r.note,
  };
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// --------------------------------------------------------------------------
// Clients
// --------------------------------------------------------------------------

export async function listClients(): Promise<Client[]> {
  const rows = await query<ClientRow>(
    `SELECT id, name, tier, services, strategist, basecamp_url, color_key, archived
       FROM clients
      ORDER BY name ASC`
  );
  return rows.map(toClient);
}

export async function createClient(input: NewClient): Promise<Client> {
  const id = newId("cl");
  const rows = await query<ClientRow>(
    `INSERT INTO clients (id, name, tier, services, strategist, basecamp_url, color_key, archived)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, name, tier, services, strategist, basecamp_url, color_key, archived`,
    [
      id,
      input.name,
      input.tier,
      input.services ?? "",
      input.strategist,
      input.basecampUrl,
      input.colorKey ?? 0,
      input.archived ?? false,
    ]
  );
  return toClient(rows[0]);
}

export async function updateClient(
  id: string,
  patch: Partial<NewClient>
): Promise<Client | null> {
  const rows = await query<ClientRow>(
    `UPDATE clients SET
        name         = COALESCE($2, name),
        tier         = COALESCE($3, tier),
        services     = COALESCE($4, services),
        strategist   = $5,
        basecamp_url = $6,
        color_key    = COALESCE($7, color_key),
        archived     = COALESCE($8, archived)
      WHERE id = $1
      RETURNING id, name, tier, services, strategist, basecamp_url, color_key, archived`,
    [
      id,
      patch.name ?? null,
      patch.tier ?? null,
      patch.services ?? null,
      patch.strategist ?? null,
      patch.basecampUrl ?? null,
      patch.colorKey ?? null,
      patch.archived ?? null,
    ]
  );
  return rows[0] ? toClient(rows[0]) : null;
}

export async function deleteClient(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `DELETE FROM clients WHERE id = $1 RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

/** Idempotent bootstrap used by POST /api/clients/seed. */
export async function seedClients(clients: Client[]): Promise<number> {
  let inserted = 0;
  for (const c of clients) {
    const rows = await query<{ id: string }>(
      `INSERT INTO clients (id, name, tier, services, strategist, basecamp_url, color_key, archived)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        c.id, c.name, c.tier, c.services, c.strategist,
        c.basecampUrl, c.colorKey, c.archived,
      ]
    );
    if (rows.length) inserted += 1;
  }
  return inserted;
}

// --------------------------------------------------------------------------
// Blocks
// --------------------------------------------------------------------------

export async function listBlocks(from?: string, to?: string): Promise<Block[]> {
  if (from && to) {
    const rows = await query<BlockRow>(
      `SELECT id, client_id, day, start_min, duration_min, priority, note
         FROM blocks
        WHERE day BETWEEN $1 AND $2
        ORDER BY day ASC, start_min ASC`,
      [from, to]
    );
    return rows.map(toBlock);
  }
  const rows = await query<BlockRow>(
    `SELECT id, client_id, day, start_min, duration_min, priority, note
       FROM blocks
      ORDER BY day ASC, start_min ASC`
  );
  return rows.map(toBlock);
}

export async function createBlock(input: NewBlock): Promise<Block> {
  const id = newId("bl");
  const rows = await query<BlockRow>(
    `INSERT INTO blocks (id, client_id, day, start_min, duration_min, priority, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, client_id, day, start_min, duration_min, priority, note`,
    [
      id,
      input.clientId,
      input.date,
      input.startMin,
      input.durationMin,
      input.priority ?? "normal",
      input.note,
    ]
  );
  return toBlock(rows[0]);
}

export async function updateBlock(
  id: string,
  patch: Partial<NewBlock>
): Promise<Block | null> {
  const rows = await query<BlockRow>(
    `UPDATE blocks SET
        day          = COALESCE($2, day),
        start_min    = COALESCE($3, start_min),
        duration_min = COALESCE($4, duration_min),
        priority     = COALESCE($5, priority),
        note         = $6
      WHERE id = $1
      RETURNING id, client_id, day, start_min, duration_min, priority, note`,
    [
      id,
      patch.date ?? null,
      patch.startMin ?? null,
      patch.durationMin ?? null,
      patch.priority ?? null,
      patch.note ?? null,
    ]
  );
  return rows[0] ? toBlock(rows[0]) : null;
}

export async function deleteBlock(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `DELETE FROM blocks WHERE id = $1 RETURNING id`,
    [id]
  );
  return rows.length > 0;
}
