// The one place email leaves the building. Each user brings their own
// provider: Resend (HTTP API) or generic SMTP (Deno native TCP via
// denomailer). No central account, no shared cap.
//
// NOTE: duplicated verbatim in ../reminders/send.ts -- Edge Functions bundle
// per-directory. Keep them in sync.

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

export type ProviderConfig =
  | {
      provider: "resend";
      fromEmail: string;
      fromName: string;
      apiKey: string;
    }
  | {
      provider: "smtp";
      fromEmail: string;
      fromName: string;
      host: string;
      port: number;
      user: string;
      pass: string;
      secure: boolean;
    };

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendEmail(
  cfg: ProviderConfig,
  msg: { to: string; subject: string; html: string },
): Promise<SendResult> {
  const from = `${cfg.fromName} <${cfg.fromEmail}>`;

  if (Deno.env.get("REMINDERS_DRY_RUN") === "1") {
    console.log("DRY_RUN", JSON.stringify({ from, to: msg.to, subject: msg.subject }));
    return { ok: true };
  }

  try {
    if (cfg.provider === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: msg.to,
          subject: msg.subject,
          html: msg.html,
        }),
      });
      if (res.ok) return { ok: true };
      return {
        ok: false,
        error: `resend ${res.status}: ${(await res.text()).slice(0, 300)}`,
      };
    }

    const client = new SMTPClient({
      connection: {
        hostname: cfg.host,
        port: cfg.port,
        tls: cfg.secure,
        auth: { username: cfg.user, password: cfg.pass },
      },
    });
    try {
      await client.send({
        from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
      });
    } finally {
      await client.close();
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: String(e instanceof Error ? e.message : e).slice(0, 300),
    };
  }
}
