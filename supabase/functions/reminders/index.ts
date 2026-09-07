// VAFlow reminder emails.
//
// pg_cron POSTs an empty body here every 15 minutes. Each run:
//   1. evening digest  -- once per user, when their local clock passes
//      digest_hour, listing tomorrow's blocked clients.
//   2. morning digest  -- once per user, in the 15-min window that starts one
//      hour before that day's first block, listing today's blocked clients.
//
// Each recipient sends through their OWN provider (Resend or SMTP), stored
// encrypted in user_email_config. A user with no config is not returned by
// get_reminder_recipients(), so they simply get nothing.
//
// Idempotency: claim a row in `daily_email_sent` first; only send if the
// INSERT won the race; roll the claim back if the send fails.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { sendEmail, type ProviderConfig } from "./send.ts";
import { decryptSecret, pgByteaToBytes } from "./crypto.ts";
import {
  addLocalDays,
  eveningDigestHtml,
  formatTime,
  localParts,
  morningDigestHtml,
  nameFromEmail,
  prettyDate,
  zonedWallClockToInstant,
  type BlockRow,
} from "./util.ts";

type Recipient = {
  user_id: string;
  email: string;
  timezone: string;
  digest_hour: number;
  provider: "resend" | "smtp";
  from_email: string;
  from_name: string;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_secure: boolean;
  secret_ciphertext: string;
  secret_nonce: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("REMINDERS_CRON_SECRET") ?? "";

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-reminders-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const now = new Date();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: recipients, error: rErr } = await admin.rpc(
    "get_reminder_recipients",
  );
  if (rErr) {
    console.error("get_reminder_recipients", rErr);
    return new Response(JSON.stringify({ ok: false, error: rErr.message }), {
      status: 500,
    });
  }
  const recs = (recipients ?? []) as Recipient[];
  if (recs.length === 0) return json({ ok: true, ran_at: now, results: [] });

  const ids = recs.map((r) => r.user_id);
  const utcToday = now.toISOString().slice(0, 10);

  const [{ data: blockData, error: bErr }, { data: sentData }] =
    await Promise.all([
      admin
        .from("blocks")
        .select(
          "id,user_id,day,start_min,duration_min,priority,note,clients(name)",
        )
        .in("user_id", ids)
        .gte("day", addLocalDays(utcToday, -1))
        .lte("day", addLocalDays(utcToday, 2)),
      admin.from("daily_email_sent").select("user_id,email_date,kind"),
    ]);
  if (bErr) {
    console.error("blocks query", bErr);
    return new Response(JSON.stringify({ ok: false, error: bErr.message }), {
      status: 500,
    });
  }

  const blocks = (blockData ?? []) as unknown as BlockRow[];
  const sent = new Set(
    (sentData ?? []).map((s) => `${s.user_id}|${s.email_date}|${s.kind}`),
  );
  const byUser = new Map<string, BlockRow[]>();
  for (const b of blocks) {
    const arr = byUser.get(b.user_id) ?? [];
    arr.push(b);
    byUser.set(b.user_id, arr);
  }

  const results: unknown[] = [];

  for (const r of recs) {
    let L: { date: string; hour: number };
    try {
      L = localParts(now, r.timezone);
    } catch {
      results.push({ user: r.user_id, skipped: "bad timezone", tz: r.timezone });
      continue;
    }

    let providerCfg: ProviderConfig;
    try {
      const secret = await decryptSecret(
        pgByteaToBytes(r.secret_ciphertext),
        pgByteaToBytes(r.secret_nonce),
      );
      providerCfg =
        r.provider === "resend"
          ? {
              provider: "resend",
              fromEmail: r.from_email,
              fromName: r.from_name,
              apiKey: secret,
            }
          : {
              provider: "smtp",
              fromEmail: r.from_email,
              fromName: r.from_name,
              host: r.smtp_host!,
              port: r.smtp_port!,
              user: r.smtp_user!,
              pass: secret,
              secure: r.smtp_secure,
            };
    } catch (e) {
      console.error("decrypt", r.user_id, e);
      await noteError(admin, r.user_id, "could not decrypt provider secret");
      results.push({ user: r.user_id, skipped: "decrypt failed" });
      continue;
    }

    const mine = (byUser.get(r.user_id) ?? [])
      .slice()
      .sort((a, b) => a.start_min - b.start_min);

    // ---- evening digest -> tomorrow ----------------------------------
    const tomorrow = addLocalDays(L.date, 1);
    if (L.hour >= r.digest_hour && !sent.has(`${r.user_id}|${tomorrow}|day_before`)) {
      const list = mine.filter((b) => b.day === tomorrow);
      if (list.length > 0 && (await claim(admin, r.user_id, tomorrow, "day_before"))) {
        const res = await sendEmail(providerCfg, {
          to: r.email,
          subject: `Your priority clients for tomorrow — ${prettyDate(tomorrow)}`,
          html: eveningDigestHtml(nameFromEmail(r.email), tomorrow, list, r.timezone),
        });
        await finish(admin, r.user_id, tomorrow, "day_before", res);
        results.push({ user: r.user_id, kind: "day_before", date: tomorrow, blocks: list.length, sent: res.ok });
      }
    }

    // ---- morning digest -> today, 1h before the first block ----------
    if (!sent.has(`${r.user_id}|${L.date}|morning`)) {
      const today = mine.filter((b) => b.day === L.date);
      if (today.length > 0) {
        const firstStart = zonedWallClockToInstant(L.date, today[0].start_min, r.timezone);
        const minsUntil = (firstStart.getTime() - now.getTime()) / 60000;
        if (minsUntil <= 60 && minsUntil > 0 && (await claim(admin, r.user_id, L.date, "morning"))) {
          const res = await sendEmail(providerCfg, {
            to: r.email,
            subject: `Your priority clients for today — first at ${formatTime(today[0].start_min)}`,
            html: morningDigestHtml(nameFromEmail(r.email), L.date, today, r.timezone),
          });
          await finish(admin, r.user_id, L.date, "morning", res);
          results.push({ user: r.user_id, kind: "morning", date: L.date, blocks: today.length, minsUntil: Math.round(minsUntil), sent: res.ok });
        }
      }
    }
  }

  return json({ ok: true, ran_at: now, results });
});

// ---------------------------------------------------------------------------

async function claim(
  admin: SupabaseClient,
  user_id: string,
  email_date: string,
  kind: string,
): Promise<boolean> {
  const { error } = await admin
    .from("daily_email_sent")
    .insert({ user_id, email_date, kind });
  if (error && error.code !== "23505") console.error("claim", error);
  return !error;
}

/** Roll the claim back on failure; record success/failure on the config row. */
async function finish(
  admin: SupabaseClient,
  user_id: string,
  email_date: string,
  kind: string,
  res: { ok: true } | { ok: false; error: string },
): Promise<void> {
  if (res.ok) {
    await admin
      .from("user_email_config")
      .update({ verified_at: new Date().toISOString(), last_error: null })
      .eq("user_id", user_id);
    return;
  }
  await admin
    .from("daily_email_sent")
    .delete()
    .match({ user_id, email_date, kind });
  await noteError(admin, user_id, res.error);
}

async function noteError(
  admin: SupabaseClient,
  user_id: string,
  error: string,
): Promise<void> {
  await admin
    .from("user_email_config")
    .update({ last_error: error })
    .eq("user_id", user_id);
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}
