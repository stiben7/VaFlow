// email-config -- the browser's only way in and out of
// public.user_email_config.
//
//   GET    -> the caller's config, non-secret fields only
//   POST   -> validate + encrypt the secret + upsert + send a test email
//   DELETE -> remove the caller's config
//
// verify_jwt = true: the gateway rejects unauthenticated calls. The handler
// derives auth.uid() from the validated JWT (an anon client bound to the
// caller's Authorization header) and does all writes with a service-role
// client.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { encryptSecret, bytesToPgBytea } from "./crypto.ts";
import { sendEmail, type ProviderConfig } from "./send.ts";

// denomailer keeps a background read loop; on a broken SMTP connection it
// rejects a promise nobody awaits, which the edge runtime treats as fatal and
// turns into a 503 ("Failed to send a request to the Edge Function"). Swallow
// it here so the handler's own error response gets through instead -- and so a
// dangling rejection can't poison a later request on the same warm isolate.
globalThis.addEventListener("unhandledrejection", (e) => {
  console.error("unhandledrejection (suppressed):", e.reason);
  e.preventDefault();
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Block SSRF: the Edge Function is the one opening the SMTP socket. */
function hostIsPrivate(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) {
    return true;
  }
  // literal IPv4
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 0 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a >= 224) return true; // multicast / reserved
  }
  // literal IPv6 loopback / link-local / ULA
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) {
    return true;
  }
  return false;
}

type PostBody = {
  provider?: unknown;
  fromEmail?: unknown;
  fromName?: unknown;
  secret?: unknown;
  smtp?: {
    host?: unknown;
    port?: unknown;
    user?: unknown;
    secure?: unknown;
  };
};

function parsePost(b: PostBody):
  | { error: string }
  | {
      row: Record<string, unknown>;
      provider: ProviderConfig;
    } {
  const provider = b.provider;
  if (provider !== "resend" && provider !== "smtp") {
    return { error: "provider must be 'resend' or 'smtp'" };
  }
  const fromEmail = String(b.fromEmail ?? "").trim();
  if (!EMAIL_RE.test(fromEmail)) return { error: "fromEmail is not a valid address" };
  const fromName = String(b.fromName ?? "VAFlow").trim().slice(0, 80) || "VAFlow";
  const secret = String(b.secret ?? "");
  if (secret.length < 4 || secret.length > 4000) {
    return { error: "secret looks wrong (length)" };
  }

  if (provider === "resend") {
    return {
      row: {
        provider,
        from_email: fromEmail,
        from_name: fromName,
        smtp_host: null,
        smtp_port: null,
        smtp_user: null,
        smtp_secure: true,
      },
      provider: { provider, fromEmail, fromName, apiKey: secret },
    };
  }

  const host = String(b.smtp?.host ?? "").trim();
  const port = Number(b.smtp?.port);
  const user = String(b.smtp?.user ?? "").trim();
  const secure = b.smtp?.secure !== false;
  if (!host) return { error: "smtp.host is required" };
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: "smtp.port must be 1-65535" };
  }
  if (!user) return { error: "smtp.user is required" };
  if (hostIsPrivate(host)) return { error: "smtp.host is not allowed" };

  return {
    row: {
      provider,
      from_email: fromEmail,
      from_name: fromName,
      smtp_host: host,
      smtp_port: port,
      smtp_user: user,
      smtp_secure: secure,
    },
    provider: { provider, fromEmail, fromName, host, port, user, pass: secret, secure },
  };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: uErr } = await asUser.auth.getUser();
  const user = userData?.user;
  if (uErr || !user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- GET ----------------------------------------------------------------
  if (req.method === "GET") {
    const { data } = await admin
      .from("user_email_config")
      .select(
        "provider, from_email, from_name, smtp_host, smtp_port, smtp_user, smtp_secure, verified_at, last_error",
      )
      .eq("user_id", user.id)
      .maybeSingle();
    if (!data) return json({ configured: false });
    return json({
      configured: true,
      provider: data.provider,
      fromEmail: data.from_email,
      fromName: data.from_name,
      smtpHost: data.smtp_host,
      smtpPort: data.smtp_port,
      smtpUser: data.smtp_user,
      smtpSecure: data.smtp_secure,
      verifiedAt: data.verified_at,
      lastError: data.last_error,
    });
  }

  // ---- DELETE ------------------------------------------------------------
  if (req.method === "DELETE") {
    await admin.from("user_email_config").delete().eq("user_id", user.id);
    return json({ configured: false });
  }

  // ---- POST ------------------------------------------------------------
  if (req.method === "POST") {
    let body: PostBody;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }

    const parsed = parsePost(body);
    if ("error" in parsed) return json({ error: parsed.error }, 400);

    // Light rate-limit on the test send: one write per 20s per user.
    const { data: existing } = await admin
      .from("user_email_config")
      .select("updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (
      existing?.updated_at &&
      Date.now() - new Date(existing.updated_at).getTime() < 20_000
    ) {
      return json({ error: "Give it a few seconds before trying again." }, 429);
    }

    let enc: { ciphertext: Uint8Array; nonce: Uint8Array };
    try {
      enc = await encryptSecret(
        parsed.provider.provider === "resend"
          ? parsed.provider.apiKey
          : parsed.provider.pass,
      );
    } catch (e) {
      console.error("encrypt", e);
      return json({ error: "server key not configured" }, 500);
    }

    const { error: upErr } = await admin.from("user_email_config").upsert(
      {
        user_id: user.id,
        ...parsed.row,
        secret_ciphertext: bytesToPgBytea(enc.ciphertext),
        secret_nonce: bytesToPgBytea(enc.nonce),
        verified_at: null,
        last_error: null,
      },
      { onConflict: "user_id" },
    );
    if (upErr) {
      console.error("upsert", upErr);
      return json({ error: upErr.message }, 500);
    }

    // Test send to the caller's own address. Cap it -- a wedged SMTP socket
    // would otherwise hang until the platform kills the request with a 503.
    const result = await Promise.race([
      sendEmail(parsed.provider, {
        to: user.email!,
        subject: "VAFlow email delivery — test",
        html:
          `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;color:#1c1917">` +
          `<p>This is a test from VAFlow.</p>` +
          `<p>Your reminder emails will now send through <strong>${parsed.row.provider}</strong> ` +
          `as <strong>${parsed.row.from_email}</strong>.</p></div>`,
      }),
      new Promise<{ ok: false; error: string }>((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: false,
              error:
                "The mail server didn't respond in time. For Gmail, use port " +
                "465 (SSL/TLS). If that keeps failing, switch to Resend.",
            }),
          25_000,
        )
      ),
    ]);

    if (result.ok) {
      await admin
        .from("user_email_config")
        .update({ verified_at: new Date().toISOString(), last_error: null })
        .eq("user_id", user.id);
      return json({ configured: true, verified: true });
    }
    await admin
      .from("user_email_config")
      .update({ last_error: result.error })
      .eq("user_id", user.id);
    return json({ configured: true, verified: false, error: result.error });
  }

  return json({ error: "method not allowed" }, 405);
});
