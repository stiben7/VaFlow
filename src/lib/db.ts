import { Pool } from "pg";

/**
 * A lazily-created singleton pool. Returns null when DATABASE_URL is unset,
 * which is the normal state while you are running in local mode -- the API
 * routes turn that null into a clean 503 instead of a stack trace.
 *
 * The global cache keeps Next's dev-mode hot reload from opening a new pool
 * on every edit.
 */
const globalForDb = globalThis as unknown as { __vaflowPool?: Pool | null };

export function getPool(): Pool | null {
  if (globalForDb.__vaflowPool !== undefined) return globalForDb.__vaflowPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    globalForDb.__vaflowPool = null;
    return null;
  }

  const pool = new Pool({
    connectionString,
    // Supabase's pooler and most managed Postgres providers terminate TLS with
    // a cert that is not in Node's trust store. Verification off, encryption on.
    ssl: process.env.PGSSL === "false" ? undefined : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  globalForDb.__vaflowPool = pool;
  return pool;
}

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export class DbUnavailableError extends Error {
  constructor() {
    super(
      "DATABASE_URL is not set. The app is running in local mode -- set " +
        "DATABASE_URL and NEXT_PUBLIC_DATA_MODE=api to use Postgres."
    );
    this.name = "DbUnavailableError";
  }
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = getPool();
  if (!pool) throw new DbUnavailableError();
  const res = await pool.query(text, params as never[]);
  return res.rows as T[];
}
