import type { Block, Client, Priority } from "./types";
import { PRIORITIES } from "./types";
import { HEX_RE } from "./colors";

export const BACKUP_VERSION = 1;

export type Backup = {
  app: "vaflow";
  version: number;
  exportedAt: string;
  clients: Client[];
  blocks: Block[];
};

export function buildBackup(clients: Client[], blocks: Block[]): Backup {
  return {
    app: "vaflow",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    clients,
    blocks,
  };
}

export function downloadBackup(clients: Client[], blocks: Block[]): void {
  const data = buildBackup(clients, blocks);
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vaflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class BackupError extends Error {}

/**
 * Parses and validates an uploaded backup.
 *
 * Everything is checked rather than trusted: a backup can be hand-edited, can
 * come from an older version, or can simply be the wrong JSON file. A bad
 * import that half-succeeds is worse than one that refuses.
 */
export function parseBackup(text: string): { clients: Client[]; blocks: Block[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("That file isn't valid JSON.");
  }

  if (typeof raw !== "object" || raw === null) {
    throw new BackupError("That file doesn't look like a VAFlow backup.");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.app !== "vaflow") {
    throw new BackupError("That file doesn't look like a VAFlow backup.");
  }
  if (!Array.isArray(obj.clients) || !Array.isArray(obj.blocks)) {
    throw new BackupError("The backup is missing its clients or blocks.");
  }

  const clients: Client[] = [];
  for (const c of obj.clients as Record<string, unknown>[]) {
    const name = String(c?.name ?? "").trim();
    if (!name) continue;
    const serviceTags = Array.isArray(c?.serviceTags)
      ? c.serviceTags
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim().slice(0, 40))
          .filter(Boolean)
      : [];
    const color =
      typeof c?.color === "string" && HEX_RE.test(c.color) ? c.color : null;
    clients.push({
      id: String(c.id ?? ""),
      name,
      serviceTags,
      notes: String(c.notes ?? c.services ?? ""),
      link: c.link ? String(c.link) : c.basecampUrl ? String(c.basecampUrl) : null,
      colorKey: Number.isFinite(c.colorKey) ? Number(c.colorKey) : 0,
      color,
      archived: Boolean(c.archived),
    });
  }

  const blocks: Block[] = [];
  for (const b of obj.blocks as Record<string, unknown>[]) {
    const date = String(b?.date ?? "");
    const startMin = Number(b?.startMin);
    const durationMin = Number(b?.durationMin);
    if (!DATE_RE.test(date)) continue;
    if (!Number.isFinite(startMin) || startMin < 0 || startMin > 1439) continue;
    if (!Number.isFinite(durationMin) || durationMin < 15) continue;
    blocks.push({
      id: String(b.id ?? ""),
      clientId: String(b.clientId ?? ""),
      date,
      startMin: Math.round(startMin),
      durationMin: Math.min(1440, Math.round(durationMin)),
      priority: PRIORITIES.includes(b.priority as Priority)
        ? (b.priority as Priority)
        : "normal",
      note: b.note ? String(b.note) : null,
    });
  }

  if (clients.length === 0) {
    throw new BackupError("That backup contains no usable clients.");
  }

  return { clients, blocks };
}

export type MergePlan = {
  newClients: Client[];
  newBlocks: Block[];
  skippedClients: number;
  droppedBlocks: number;
};

/**
 * Works out what to actually write, given what the account already has.
 *
 * Restoring into a *different* account is the normal case -- moving browser
 * data into a fresh Supabase login -- so ids from the backup cannot be reused
 * blindly. Clients are matched by name (case-insensitive): an existing match
 * is reused rather than duplicated, and every imported block is repointed at
 * whichever id actually ended up in the account.
 */
export function planMerge(
  existing: Client[],
  incoming: { clients: Client[]; blocks: Block[] },
  makeId: (prefix: string) => string
): MergePlan {
  const byName = new Map<string, string>();
  for (const c of existing) byName.set(c.name.trim().toLowerCase(), c.id);

  /** old client id -> id to use in this account */
  const remap = new Map<string, string>();
  const newClients: Client[] = [];
  let skippedClients = 0;

  for (const c of incoming.clients) {
    const key = c.name.trim().toLowerCase();
    const existingId = byName.get(key);
    if (existingId) {
      remap.set(c.id, existingId);
      skippedClients += 1;
      continue;
    }
    const id = makeId("cl");
    remap.set(c.id, id);
    byName.set(key, id);
    newClients.push({ ...c, id });
  }

  const existingIds = new Set(existing.map((c) => c.id));
  const newBlocks: Block[] = [];
  let droppedBlocks = 0;

  for (const b of incoming.blocks) {
    const clientId = remap.get(b.clientId) ?? b.clientId;
    // A block whose client is neither in the backup nor already here would
    // violate the foreign key, so drop it rather than fail the whole import.
    if (!remap.has(b.clientId) && !existingIds.has(b.clientId)) {
      droppedBlocks += 1;
      continue;
    }
    newBlocks.push({ ...b, id: makeId("bl"), clientId });
  }

  return { newClients, newBlocks, skippedClients, droppedBlocks };
}
