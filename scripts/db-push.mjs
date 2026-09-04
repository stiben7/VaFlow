#!/usr/bin/env node
/**
 * Applies db/schema.sql to DATABASE_URL, then seeds the client roster.
 *
 *   DATABASE_URL=postgresql://... npm run db:push
 *
 * Safe to run more than once: every statement is IF NOT EXISTS / OR REPLACE,
 * and the seed uses ON CONFLICT DO NOTHING.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set.\n" +
      "  DATABASE_URL=postgresql://... npm run db:push"
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: process.env.PGSSL === "false" ? undefined : { rejectUnauthorized: false },
});

const CLIENT_COLUMNS =
  "(id, name, tier, services, strategist, basecamp_url, color_key, archived)";

async function main() {
  await client.connect();
  console.log("Connected.");

  const schema = readFileSync(join(root, "db", "schema.sql"), "utf8");
  await client.query(schema);
  console.log("Schema applied.");

  // Pull the seed straight out of the TypeScript source so there is exactly
  // one copy of the roster in the repo.
  const src = readFileSync(join(root, "src", "lib", "seed.ts"), "utf8");
  const rows = parseSeed(src);

  let inserted = 0;
  for (const r of rows) {
    const res = await client.query(
      `INSERT INTO clients ${CLIENT_COLUMNS}
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [r.id, r.name, r.tier, r.services, r.strategist, r.basecampUrl, r.colorKey, false]
    );
    inserted += res.rowCount ?? 0;
  }

  console.log(`Seed: ${inserted} inserted, ${rows.length - inserted} already present.`);
  await client.end();
}

/**
 * Minimal extractor for the object literals in seed.ts. Avoids adding a
 * TypeScript loader just to run one script.
 */
function parseSeed(src) {
  const start = src.indexOf("export const SEED_CLIENTS");
  const body = src.slice(start, src.indexOf("\n];", start));
  const out = [];

  for (const chunk of body.split(/\n  \{\n/).slice(1)) {
    const pick = (key) => {
      const m = chunk.match(
        new RegExp(`${key}:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|(null))`, "s")
      );
      if (!m) return null;
      if (m[2]) return null;
      return m[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
    };
    const id = pick("id");
    if (!id) continue;

    const basecamp = chunk.match(/BASECAMP\("(\d+)"\)/);
    const colorKey = chunk.match(/colorKey:\s*(\d+)/);

    out.push({
      id,
      name: pick("name") ?? id,
      tier: pick("tier") ?? "Custom",
      services: pick("services") ?? "",
      strategist: pick("strategist"),
      basecampUrl: basecamp
        ? `https://app.basecamp.com/5644180/projects/${basecamp[1]}`
        : null,
      colorKey: colorKey ? Number(colorKey[1]) : 0,
    });
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
