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

    // TLS mode is decided by the port, not the stored checkbox: implicit TLS
    // on 465, STARTTLS on 587/25. The runtime's STARTTLS is unreliable, so a
    // mismatched flag would otherwise surface as a cryptic "InvalidContentType".
    // Only a non-standard port falls back to the stored flag.
    const implicitTls =
      cfg.port === 465
        ? true
        : cfg.port === 587 || cfg.port === 25
          ? false
          : cfg.secure;

    const client = new SMTPClient({
      connection: {
        hostname: cfg.host,
        port: cfg.port,
        tls: implicitTls,
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
      // denomailer's close() on a half-broken connection throws asynchronously
      // and would otherwise escape as an unhandled rejection that kills the
      // isolate (a 503, not a readable error).
      try {
        await client.close();
      } catch {
        /* ignore */
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlySmtpError(e) };
  }
}

/** Turn denomailer / TLS internals into something a user can act on. */
function friendlySmtpError(e: unknown): string {
  const raw = String(e instanceof Error ? e.message : e);
  if (/InvalidContentType|corrupt message|BadRecordMac|UnexpectedEof|handshake/i.test(raw)) {
    return (
      "Couldn't open a secure connection to the mail server. For Gmail use " +
      "port 465. Port 587 (STARTTLS) is unreliable on this host."
    );
  }
  if (/\b535\b|\b534\b|BadCredentials|not accepted|AuthenticationFailed|Invalid login|invalid cmd|\bauth\b/i.test(raw)) {
    return (
      "The mail server rejected the login. Gmail needs a 16-character App " +
      "Password with 2-Step Verification on, not your normal password."
    );
  }
  if (/getaddrinfo|dns|ENOTFOUND|failed to lookup/i.test(raw)) {
    return `Couldn't resolve the SMTP host. Check the hostname. (${raw.slice(0, 80)})`;
  }
  return raw.slice(0, 300);
}
