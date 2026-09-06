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
  tier          TEXT        NOT NULL DEFAULT 'Custom',
  services      TEXT        NOT NULL DEFAULT '',
  strategist    TEXT,
  basecamp_url  TEXT,
  color_key     INTEGER     NOT NULL DEFAULT 0,
  archived      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT clients_tier_chk CHECK (tier IN (
    'Foundation', 'Accelerated Growth', 'Peak Performance',
    'Paid Ads Only', 'Custom'
  ))
);

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
