-- ===========================================================================
-- VAFlow schema -- per-user clients and schedule, protected by RLS.
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query -> paste all of
-- this -> Run. Safe to run more than once.
--
-- The security model: every row carries the user_id of whoever created it,
-- and row level security makes it impossible to read or write anybody else's
-- rows -- not "the app doesn't show them", but the database refuses. The
-- browser holds only the publishable key, which grants nothing on its own.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clients (
  id            TEXT PRIMARY KEY,
  user_id       UUID        NOT NULL DEFAULT auth.uid()
                            REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  -- Availed services, e.g. '{Website,Automation,GHL}'. A set, not a tier.
  -- Five ship as defaults; users may add their own labels, so no allow-list.
  service_tags  TEXT[]      NOT NULL DEFAULT '{}',
  -- Free text: deliverables, extra links, anything.
  notes         TEXT        NOT NULL DEFAULT '',
  -- The client's project / workspace URL (Basecamp, Teamwork, ClickUp, ...).
  link          TEXT,
  color_key     INTEGER     NOT NULL DEFAULT 0,
  -- Optional custom hex ('#rrggbb'); overrides color_key when set.
  color         TEXT,
  archived      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT clients_color_chk CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$')
);

-- Migration for a database created before this change: run these once. Safe to
-- re-run; each guards itself.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS service_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_tier_chk;
ALTER TABLE public.clients DROP COLUMN IF EXISTS tier;
-- The service-tag allow-list is gone: users can add their own labels.
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_service_tags_chk;
-- basecamp_url -> link (tool-agnostic); services -> notes; strategist dropped.
DO $$ BEGIN
  ALTER TABLE public.clients RENAME COLUMN basecamp_url TO link;
EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.clients RENAME COLUMN services TO notes;
EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE public.clients DROP COLUMN IF EXISTS strategist;
DO $$ BEGIN
  ALTER TABLE public.clients ADD CONSTRAINT clients_color_chk
    CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- blocks
--
-- A block is one client parked on one day at one time. Deliberately not a
-- task: v1 answers "when does this account get my attention", nothing more.
-- Tasks will hang off block_id later.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocks (
  id            TEXT PRIMARY KEY,
  user_id       UUID        NOT NULL DEFAULT auth.uid()
                            REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id     TEXT        NOT NULL
                            REFERENCES public.clients(id) ON DELETE CASCADE,

  -- A DATE, not a timestamp. A block dropped on Monday 9am must stay Monday
  -- 9am no matter what timezone reads the row.
  day           DATE        NOT NULL,
  start_min     INTEGER     NOT NULL,
  duration_min  INTEGER     NOT NULL DEFAULT 60,

  priority      TEXT        NOT NULL DEFAULT 'normal',
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT blocks_start_chk    CHECK (start_min BETWEEN 0 AND 1439),
  CONSTRAINT blocks_duration_chk CHECK (duration_min BETWEEN 15 AND 1440),
  CONSTRAINT blocks_priority_chk CHECK (priority IN ('high', 'normal', 'low'))
);

-- ---------------------------------------------------------------------------
-- Indexes
--
-- Every query the app makes is scoped by user_id first, because RLS adds that
-- predicate to every statement. Leading with user_id is what keeps these
-- useful rather than decorative.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS clients_user_name_idx ON public.clients (user_id, name);
CREATE INDEX IF NOT EXISTS blocks_user_day_idx   ON public.blocks  (user_id, day);
CREATE INDEX IF NOT EXISTS blocks_client_idx     ON public.blocks  (client_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_touch ON public.clients;
CREATE TRIGGER clients_touch BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS blocks_touch ON public.blocks;
CREATE TRIGGER blocks_touch BEFORE UPDATE ON public.blocks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===========================================================================
-- Row Level Security
--
-- Without these two blocks, the publishable key would let anyone read every
-- account's data. This is the actual security boundary -- not the UI.
-- ===========================================================================
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks  ENABLE ROW LEVEL SECURITY;

-- Separate policies per command rather than one FOR ALL, so the WITH CHECK on
-- INSERT/UPDATE is explicit: you cannot create a row owned by someone else,
-- and you cannot reassign one of your rows to another user.

DROP POLICY IF EXISTS clients_select_own ON public.clients;
CREATE POLICY clients_select_own ON public.clients
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS clients_insert_own ON public.clients;
CREATE POLICY clients_insert_own ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS clients_update_own ON public.clients;
CREATE POLICY clients_update_own ON public.clients
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS clients_delete_own ON public.clients;
CREATE POLICY clients_delete_own ON public.clients
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS blocks_select_own ON public.blocks;
CREATE POLICY blocks_select_own ON public.blocks
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS blocks_insert_own ON public.blocks;
CREATE POLICY blocks_insert_own ON public.blocks
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS blocks_update_own ON public.blocks;
CREATE POLICY blocks_update_own ON public.blocks
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS blocks_delete_own ON public.blocks;
CREATE POLICY blocks_delete_own ON public.blocks
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Note on `(SELECT auth.uid())` rather than a bare `auth.uid()`: wrapping it
-- lets Postgres evaluate it once per statement instead of once per row. On a
-- few hundred rows it is invisible; it stops mattering only if you never grow.

-- ===========================================================================
-- Verify (optional) -- both should report rowsecurity = true
-- ===========================================================================
-- SELECT tablename, rowsecurity FROM pg_tables
--  WHERE schemaname = 'public' AND tablename IN ('clients', 'blocks');


-- ===========================================================================
-- Email reminders
--
-- Two digest emails a day, to the VA's own address:
--   * the evening before -- "your priority clients for tomorrow"
--   * one hour before the first block of the day -- "your priority clients
--     for today"
--
-- A Supabase Edge Function ('reminders'), poked every 15 min by pg_cron, does
-- the sending. These tables only hold the per-user timezone/toggle and a
-- record of what has already gone out.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- profiles -- one row per user, created by the app on first load.
--
-- `timezone` is the IANA name the browser reports
-- (Intl.DateTimeFormat().resolvedOptions().timeZone). It is NULL until the app
-- has captured it, and a NULL timezone means no emails -- a block is "Monday
-- 9am" with no zone attached, so the reminder job cannot know when 8am is.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id           UUID PRIMARY KEY
                    REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone          TEXT,
  reminders_enabled BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Local hour (0-23) to send the evening "tomorrow" digest.
  digest_hour       SMALLINT    NOT NULL DEFAULT 18,
  -- Public URL of the uploaded avatar (in the 'avatars' storage bucket),
  -- with a ?v= cache-buster. NULL -> show initials.
  avatar_url        TEXT,
  -- Whether an animated (GIF) avatar plays. FALSE -> the client freezes it to
  -- its first frame. Purely a per-user display preference.
  animate_avatar    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT profiles_digest_hour_chk CHECK (digest_hour BETWEEN 0 AND 23)
);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS animate_avatar BOOLEAN NOT NULL DEFAULT TRUE;

DROP TRIGGER IF EXISTS profiles_touch ON public.profiles;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Backfill: give every existing user a row. timezone stays NULL, so nobody
-- gets an email until they next open the app. Safe to re-run.
INSERT INTO public.profiles (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- daily_email_sent -- idempotency. One row per (user, day, kind) once the
-- corresponding email has been sent. `email_date` is the day the email is
-- ABOUT: tomorrow's date for 'day_before', today's date for 'morning'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_email_sent (
  user_id     UUID        NOT NULL
              REFERENCES auth.users(id) ON DELETE CASCADE,
  email_date  DATE        NOT NULL,
  kind        TEXT        NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, email_date, kind),
  CONSTRAINT daily_email_sent_kind_chk CHECK (kind IN ('day_before', 'morning'))
);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- profiles: the owner may read and change their own row (timezone + toggle).
-- daily_email_sent: nobody -- only the service-role Edge Function touches it,
-- and the service role bypasses RLS. Enabling RLS with no policy makes it
-- unreachable from the browser.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_email_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
-- No DELETE policy: a profile dies with its user via ON DELETE CASCADE.

-- ---------------------------------------------------------------------------
-- user_email_config -- each user brings their own sending provider (SMTP or
-- Resend). No config => that user gets no reminder emails.
--
-- The secret (SMTP password or Resend API key) is AES-256-GCM encrypted by
-- the `email-config` Edge Function before it lands here. The ciphertext is
-- inert without EMAIL_ENC_KEY, which lives only in the Edge Function env.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_email_config (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider          TEXT        NOT NULL,               -- 'resend' | 'smtp'
  from_email        TEXT        NOT NULL,
  from_name         TEXT        NOT NULL DEFAULT 'VAFlow',
  -- SMTP-only, all non-secret:
  smtp_host         TEXT,
  smtp_port         INTEGER,
  smtp_user         TEXT,
  smtp_secure       BOOLEAN     NOT NULL DEFAULT TRUE,   -- implicit TLS (465) vs STARTTLS
  -- the SMTP password OR the Resend API key, AES-256-GCM:
  secret_ciphertext BYTEA       NOT NULL,
  secret_nonce      BYTEA       NOT NULL,                -- 12-byte IV
  verified_at       TIMESTAMPTZ,                          -- last successful test / send
  last_error        TEXT,                                 -- last failure, for the UI
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uec_provider_chk   CHECK (provider IN ('resend', 'smtp')),
  CONSTRAINT uec_from_email_chk  CHECK (from_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT uec_smtp_port_chk   CHECK (smtp_port IS NULL OR smtp_port BETWEEN 1 AND 65535)
);

DROP TRIGGER IF EXISTS uec_touch ON public.user_email_config;
CREATE TRIGGER uec_touch BEFORE UPDATE ON public.user_email_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.user_email_config ENABLE ROW LEVEL SECURITY;

-- The owner may READ their own row (the secret is only ciphertext, inert
-- without the key) and DELETE it. No INSERT/UPDATE policy: every write goes
-- through the `email-config` Edge Function so the secret is always encrypted
-- and `provider` is always validated.
DROP POLICY IF EXISTS uec_select_own ON public.user_email_config;
CREATE POLICY uec_select_own ON public.user_email_config
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS uec_delete_own ON public.user_email_config;
CREATE POLICY uec_delete_own ON public.user_email_config
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- get_reminder_recipients() -- the Edge Function calls this (as the service
-- role) to get the send list plus each user's provider config, without
-- paging all of auth.users. SECURITY DEFINER so it can read auth.users;
-- locked away from anon/authenticated. The INNER JOIN on user_email_config
-- means a user with no provider is simply absent -> no email.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_reminder_recipients();
CREATE FUNCTION public.get_reminder_recipients()
RETURNS TABLE (
  user_id UUID, email TEXT, timezone TEXT, digest_hour SMALLINT,
  provider TEXT, from_email TEXT, from_name TEXT,
  smtp_host TEXT, smtp_port INTEGER, smtp_user TEXT, smtp_secure BOOLEAN,
  secret_ciphertext BYTEA, secret_nonce BYTEA
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.user_id, u.email::TEXT, p.timezone, p.digest_hour,
         c.provider, c.from_email, c.from_name,
         c.smtp_host, c.smtp_port, c.smtp_user, c.smtp_secure,
         c.secret_ciphertext, c.secret_nonce
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  JOIN public.user_email_config c ON c.user_id = p.user_id
  WHERE p.reminders_enabled
    AND p.timezone IS NOT NULL
    AND u.email IS NOT NULL;
$$;

-- Functions are EXECUTE-able by PUBLIC by default; lock this to the service
-- role so a signed-in user cannot call /rest/v1/rpc/get_reminder_recipients
-- and read everyone's email, timezone, and encrypted provider secret.
REVOKE EXECUTE ON FUNCTION public.get_reminder_recipients() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_reminder_recipients() TO service_role;

-- ---------------------------------------------------------------------------
-- Avatars storage bucket
--
-- Public read (avatars show on the sign-in-free landing too); each user may
-- only write inside the folder named by their own uid, so
-- `<uid>/avatar` is the only path they can touch.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
CREATE POLICY avatars_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
CREATE POLICY avatars_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;
CREATE POLICY avatars_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- ===========================================================================
-- Scheduler -- run this block ONCE, after the 'reminders' Edge Function is
-- deployed and its secrets are set. It is split out because it enables
-- extensions and needs a secret value filled in.
-- ===========================================================================
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- -- Shared secret the cron job sends and the function checks. Generate a
-- -- random 64-char string and use the SAME value for the function's
-- -- REMINDERS_CRON_SECRET env var.
-- SELECT vault.create_secret('<RANDOM_64_CHARS>', 'reminders_cron_secret');
--
-- SELECT cron.schedule('reminders-tick', '*/15 * * * *', $CRON$
--   SELECT net.http_post(
--     url     := 'https://kncjqkbihzqlycgqrxvx.supabase.co/functions/v1/reminders',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-reminders-secret',
--       (SELECT decrypted_secret FROM vault.decrypted_secrets
--         WHERE name = 'reminders_cron_secret')
--     ),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 120000
--   );
-- $CRON$);
--
-- -- To stop all reminder emails:  SELECT cron.unschedule('reminders-tick');
