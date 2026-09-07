// VAFlow reminder emails.
//
// Two callers:
//   - pg_cron POSTs here every 15 minutes with the x-reminders-secret header.
//     Each run sends, per user: an evening digest (tomorrow's blocked clients,
//     once their local clock passes digest_hour) and a morning digest (today's,
//     in the 15-min window one hour before the first block).
//   - a signed-in user POSTs `{ preview: true }` with their JWT to get both
//     digests sent to their own address right now -- ignoring the time windows
//     and the once-per-day idempotency, and falling back to sample rows if they
//     have nothing booked for that day. Subjects are prefixed "[Sample]".
//
// Each recipient sends through their OWN provider (Resend or SMTP), stored
// encrypted in user_email_config.
//
// Idempotency (cron only): claim a row in `daily_email_sent` first; only send
// if the INSERT won the race; roll the claim back if the send fails.

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

// denomailer's background read loop rejects an un-awaited promise on a broken
// SMTP connection; the edge runtime treats that as fatal. Swallow it so one
// bad recipient can't 503 the whole run.
globalThis.addEventListener("unhandledrejection", (e) => {
  console.error("unhandledrejection (suppressed):", e.reason);
  e.preventDefault();
});

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
const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  "";
const CRON_SECRET = Deno.env.get("REMINDERS_CRON_SECRET") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Cron caller: the shared secret. Otherwise treat it as a signed-in user
  // asking for a preview of their own digests.
  const isCron =
    !!CRON_SECRET && req.headers.get("x-reminders-secret") === CRON_SECRET;

  if (!isCron) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader || !ANON_KEY) {
      return json({ error: "unauthorized" }, 401);
    }
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await asUser.auth.getUser();
    if (!userData?.user) return json({ error: "unauthorized" }, 401);
    return sendPreview(admin, userData.user.id, userData.user.email ?? "");
  }

  const now = new Date();

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

// ---------------------------------------------------------------------------
// preview -- send this user both digests to their own address, now
// ---------------------------------------------------------------------------

/** Three plausible-looking rows so the template renders when nothing is booked. */
function sampleBlocks(day: string): BlockRow[] {
  return [
    {
      id: "sample-1", user_id: "", day,
      start_min: 9 * 60, duration_min: 60, priority: "high",
      note: "Kickoff call — walk through the brief",
      clients: { name: "Rosewood Bridal" },
    },
    {
      id: "sample-2", user_id: "", day,
      start_min: 13 * 60 + 30, duration_min: 90, priority: "normal",
      note: null,
      clients: { name: "Cobalt Studio" },
    },
    {
      id: "sample-3", user_id: "", day,
      start_min: 16 * 60, duration_min: 30, priority: "low",
      note: "Send the invoice",
      clients: { name: "Delta Group" },
    },
  ];
}

async function sendPreview(
  admin: SupabaseClient,
  userId: string,
  userEmail: string,
): Promise<Response> {
  if (!userEmail) return json({ error: "Your account has no email address." }, 400);

  const [{ data: cfg }, { data: prof }] = await Promise.all([
    admin
      .from("user_email_config")
      .select(
        "provider, from_email, from_name, smtp_host, smtp_port, smtp_user, smtp_secure, secret_ciphertext, secret_nonce",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("timezone, digest_hour")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!cfg?.secret_ciphertext) {
    return json({ error: "Set up email delivery first, then try the sample." }, 400);
  }

  let providerCfg: ProviderConfig;
  try {
    const secret = await decryptSecret(
      pgByteaToBytes(cfg.secret_ciphertext),
      pgByteaToBytes(cfg.secret_nonce),
    );
    providerCfg =
      cfg.provider === "resend"
        ? { provider: "resend", fromEmail: cfg.from_email, fromName: cfg.from_name, apiKey: secret }
        : {
            provider: "smtp",
            fromEmail: cfg.from_email, fromName: cfg.from_name,
            host: cfg.smtp_host!, port: cfg.smtp_port!, user: cfg.smtp_user!,
            pass: secret, secure: cfg.smtp_secure,
          };
  } catch (e) {
    console.error("preview decrypt", userId, e);
    return json({ error: "Couldn't read your provider secret. Re-save it and retry." }, 500);
  }

  const tz = prof?.timezone ?? "UTC";
  let L: { date: string; hour: number };
  try {
    L = localParts(new Date(), tz);
  } catch {
    L = { date: new Date().toISOString().slice(0, 10), hour: 12 };
  }
  const tomorrow = addLocalDays(L.date, 1);

  const { data: blockData } = await admin
    .from("blocks")
    .select("id,user_id,day,start_min,duration_min,priority,note,clients(name)")
    .eq("user_id", userId)
    .in("day", [L.date, tomorrow]);
  const all = ((blockData ?? []) as unknown as BlockRow[])
    .slice()
    .sort((a, b) => a.start_min - b.start_min);

  const realTomorrow = all.filter((b) => b.day === tomorrow);
  const realToday = all.filter((b) => b.day === L.date);
  const eveningList = realTomorrow.length ? realTomorrow : sampleBlocks(tomorrow);
  const morningList = realToday.length ? realToday : sampleBlocks(L.date);
  const name = nameFromEmail(userEmail);

  const evening = await sendEmail(providerCfg, {
    to: userEmail,
    subject: `[Sample] Your priority clients for tomorrow — ${prettyDate(tomorrow)}`,
    html: eveningDigestHtml(name, tomorrow, eveningList, tz),
  });
  const morning = await sendEmail(providerCfg, {
    to: userEmail,
    subject: `[Sample] Your priority clients for today — first at ${formatTime(morningList[0].start_min)}`,
    html: morningDigestHtml(name, L.date, morningList, tz),
  });

  const failed = [evening, morning].find((r) => !r.ok) as
    | { ok: false; error: string }
    | undefined;
  if (failed) {
    await noteError(admin, userId, failed.error);
    return json({ ok: false, error: failed.error }, 200);
  }
  return json({
    ok: true,
    sentTo: userEmail,
    sampleUsed: { evening: !realTomorrow.length, morning: !realToday.length },
  });
}
