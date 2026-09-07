# `reminders` Edge Function

Sends two digest emails per user per day:

- **evening** — when the user's local clock passes `profiles.digest_hour`
  (default 18:00): "your priority clients for tomorrow".
- **morning** — in the 15-minute window that begins one hour before that
  day's first block: "your priority clients for today".

`pg_cron` POSTs an empty body here every 15 minutes. All timing is computed
from `profiles.timezone` (the browser's IANA zone, captured by the app on
load). A NULL timezone means no email.

## Setup (one time)

### 1. EmailJS

1. Create an account, add an **Email Service** and connect **Gmail** (OAuth).
2. Create **one template** with these fields:
   - **To**: `{{to_email}}`
   - **Subject**: `{{subject}}`
   - **Content**: `{{{content_html}}}`  ← triple braces (raw HTML)
3. **Account → Security → enable "Allow EmailJS API for non-browser
   applications"**.
4. Copy: Service ID, Template ID, Public Key, Private Key.

### 2. Function secrets

Supabase dashboard → Edge Functions → `reminders` → Secrets:

| Secret | Value |
|---|---|
| `REMINDERS_CRON_SECRET` | a random 64-char string (also goes in Vault, below) |
| `EMAILJS_SERVICE_ID` | from EmailJS |
| `EMAILJS_TEMPLATE_ID` | from EmailJS |
| `EMAILJS_PUBLIC_KEY` | from EmailJS |
| `EMAILJS_PRIVATE_KEY` | from EmailJS |
| `REMINDERS_DRY_RUN` | optional — set to `1` to log emails instead of sending |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### 3. Scheduler

Run the commented "Scheduler" block at the bottom of `db/schema.sql` once,
filling in the same random string for both `vault.create_secret(...)` and the
`REMINDERS_CRON_SECRET` function secret.

To stop all reminder emails: `SELECT cron.unschedule('reminders-tick');`

## Test

```
# 401 without the secret
curl -X POST https://<ref>.supabase.co/functions/v1/reminders

# 200, empty, with it
curl -X POST https://<ref>.supabase.co/functions/v1/reminders \
  -H "x-reminders-secret: <REMINDERS_CRON_SECRET>"
```

Set `REMINDERS_DRY_RUN=1`, create a block ~50 minutes out for today, and curl
again — the rendered HTML shows up in the function logs without sending.

## Swapping the email provider

Rewrite `send.ts` only. Nothing else knows how mail is sent.
