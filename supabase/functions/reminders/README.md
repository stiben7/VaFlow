# reminders and email-config Edge Functions

Two digest emails per user per day, each sent through that user's own provider
(Resend or SMTP). There is no central email account.

* **Evening**: when the user's local clock passes `profiles.digest_hour`
  (default 18:00). Subject and body: "your priority clients for tomorrow".
* **Morning**: in the 15 minute window that begins one hour before that day's
  first block. "your priority clients for today".

Both list the day's registered clients with start times, priority, and notes.
The template is fixed in `util.ts`. There is no per user customisation.


## How it fits together

```
Settings dialog
  supabase.functions.invoke("email-config", ...)   [signed in, JWT]
    POST    validate, then AES-256-GCM encrypt the secret,
            then upsert public.user_email_config,
            then send a test email to the user's own address
    GET     non secret fields plus { configured, verifiedAt, lastError }
    DELETE  remove the row

pg_cron every 15 min
  POST /reminders   (x-reminders-secret header)
    get_reminder_recipients()   inner joins user_email_config,
                                so no config means no email
    per user: decrypt the secret, then send.ts, then Resend API or SMTP
    on failure: write user_email_config.last_error
```

`EMAIL_ENC_KEY` (32 random bytes, base64) encrypts every provider secret. It
lives only in the Edge Function environment. The ciphertext in
`user_email_config` is useless without it.


## Setup for the operator (one time)

### 1. Encryption key

```bash
openssl rand -base64 32
```

Supabase dashboard, then **Edge Functions**, then **Secrets**. Add
`EMAIL_ENC_KEY` with that value. Secrets are project wide, so it covers both
functions.

### 2. Deploy

Both functions are deployed from this repo via the Supabase MCP or the CLI.
`email-config` has verify_jwt true. `reminders` has verify_jwt false.

### 3. Scheduler

Run the commented "Scheduler" block at the bottom of `db/schema.sql` once. It
enables `pg_cron` and `pg_net`, stores a random `reminders_cron_secret` in
Vault, and schedules `reminders-tick` every 15 minutes. Add the matching
`REMINDERS_CRON_SECRET` value as an Edge Function secret.

To stop all reminder emails:

```sql
SELECT cron.unschedule('reminders-tick');
```


## Setup for each user

Settings, then **Email delivery**:

* **Resend**: paste an API key, set the From address. Resend needs a verified
  domain to send from a custom address.
* **SMTP**: host, port, username, password, TLS toggle, From address.
  Examples: Brevo `smtp-relay.brevo.com:587` with TLS off (STARTTLS), or a
  Gmail app password on `smtp.gmail.com:465` with TLS on.

"Save and send test" stores the config and sends a test email to your own
address. A green check means verified.


## Function secrets

| Secret | Function | Notes |
| --- | --- | --- |
| `EMAIL_ENC_KEY` | both | 32 bytes base64, encrypts provider secrets |
| `REMINDERS_CRON_SECRET` | reminders | matches the Vault secret in the cron job |
| `REMINDERS_DRY_RUN` | both | optional `1`, logs instead of sending |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | both | injected automatically |


## Test

```bash
# reminders auth gate
curl -X POST https://<ref>.supabase.co/functions/v1/reminders             # 401
curl -X POST https://<ref>.supabase.co/functions/v1/reminders \
  -H "x-reminders-secret: <REMINDERS_CRON_SECRET>"                         # 200

# email-config needs a bearer token
curl -X GET https://<ref>.supabase.co/functions/v1/email-config           # 401
```

`REMINDERS_DRY_RUN=1` logs the rendered HTML in the function logs without
sending.


## Notes

* `crypto.ts` and `send.ts` are duplicated in both function directories. Edge
  Functions bundle per directory, so keep the copies in sync.
* `user_email_config` has no INSERT or UPDATE RLS policy by design. Every write
  goes through `email-config` so the secret is always encrypted.
* Rotating `EMAIL_ENC_KEY` makes every stored secret unreadable. Users have to
  re enter their provider.
* Redeploying `reminders` via the MCP needs `import_map_path: "deno.json"`
  passed explicitly, otherwise a stale path breaks the deploy.
