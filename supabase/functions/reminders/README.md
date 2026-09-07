# `reminders` + `email-config` Edge Functions

Two digest emails per user per day, each sent through **that user's own
provider** (Resend or SMTP). No central email account.

- **evening** — when the user's local clock passes `profiles.digest_hour`
  (default 18:00): "your priority clients for tomorrow".
- **morning** — in the 15-minute window that begins one hour before that
  day's first block: "your priority clients for today".

Both list the day's registered clients with start times, priority, and notes.
The template is fixed (`util.ts`) — no per-user customisation.

## How it fits together

```
Settings dialog ─ supabase.functions.invoke("email-config", ...) [JWT]
                    POST  → validate + AES-256-GCM encrypt the secret
                          → upsert public.user_email_config
                          → test send to the user's own address
                    GET   → non-secret fields + {configured, verifiedAt, lastError}
                    DELETE→ remove the row

pg_cron (*/15) ─ POST /reminders  (x-reminders-secret header)
                    get_reminder_recipients()  — INNER JOIN user_email_config,
                                                 so no config ⇒ no email
                    per user: decrypt secret → send.ts → Resend API / SMTP
                    failure → user_email_config.last_error
```

`EMAIL_ENC_KEY` (32 random bytes, base64) encrypts every provider secret. It
lives only in the Edge Function environment. The ciphertext in
`user_email_config` is inert without it.

## Setup (operator, one time)

### 1. Encryption key

```bash
openssl rand -base64 32
```

Supabase dashboard → **Edge Functions → Secrets** → add `EMAIL_ENC_KEY` with
that value. (Secrets are project-wide, so it covers both functions.)

### 2. Deploy

Both functions are deployed from this repo via the Supabase MCP or CLI:
`email-config` (verify_jwt **true**), `reminders` (verify_jwt **false**).

### 3. Scheduler

Run the commented **"Scheduler"** block at the bottom of `db/schema.sql`
once. It enables `pg_cron` + `pg_net`, stores a random `reminders_cron_secret`
in Vault, and schedules `reminders-tick` every 15 minutes. Add the matching
`REMINDERS_CRON_SECRET` value as an Edge Function secret.

To stop all reminder emails: `SELECT cron.unschedule('reminders-tick');`

## Setup (each VA)

Settings → **Email delivery**:

- **Resend** — paste an API key, set the From address. Resend needs a
  verified domain to send from a custom address.
- **SMTP** — host, port, username, password, TLS toggle, From address.
  Examples: Brevo `smtp-relay.brevo.com:587` (TLS off = STARTTLS);
  Gmail app-password `smtp.gmail.com:465` (TLS on).

"Save & send test" stores the config and sends a test email to the VA's own
address. Green check = verified.

## Function secrets

| Secret | Function(s) | Notes |
|---|---|---|
| `EMAIL_ENC_KEY` | both | 32 bytes base64; encrypts provider secrets |
| `REMINDERS_CRON_SECRET` | `reminders` | matches the Vault secret in the cron job |
| `REMINDERS_DRY_RUN` | both | optional `1` — log instead of send |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | both | auto-injected |

## Test

```bash
# reminders auth gate
curl -X POST https://<ref>.supabase.co/functions/v1/reminders            # 401
curl -X POST https://<ref>.supabase.co/functions/v1/reminders \
  -H "x-reminders-secret: <REMINDERS_CRON_SECRET>"                        # 200 {"ok":true,...}

# email-config needs a bearer token
curl -X GET https://<ref>.supabase.co/functions/v1/email-config          # 401
```

`REMINDERS_DRY_RUN=1` logs the rendered HTML in the function logs without
sending.

## Notes

- `crypto.ts` and `send.ts` are duplicated in both function directories —
  Edge Functions bundle per-directory. Keep the copies in sync.
- `user_email_config` has **no INSERT/UPDATE RLS policy** by design: all
  writes go through `email-config` so the secret is always encrypted.
- Rotating `EMAIL_ENC_KEY` orphans every stored secret — users must re-enter
  their provider.
