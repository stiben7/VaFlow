-- ---------------------------------------------------------------------------
-- VAFlow schema
--
-- Portable ANSI-ish SQL. Runs as-is on Postgres (Supabase/Neon/RDS).
-- Notes for the eventual Oracle move are inline.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clients (
  id            TEXT PRIMARY KEY,
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

-- A "block" is one client parked on one day at one time. It is intentionally
-- NOT a task: the whole point of v1 is deciding *when a client gets attention*,
-- not itemising the work. Tasks will hang off block_id later.
CREATE TABLE IF NOT EXISTS blocks (
  id            TEXT PRIMARY KEY,
  client_id     TEXT        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Local calendar date, not a timestamp. A block dropped on Monday 9am must
  -- stay Monday 9am no matter what timezone reads the row.
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

-- The week view queries by date range, every time. This index is the one that
-- matters once there are a few thousand rows.
CREATE INDEX IF NOT EXISTS blocks_day_idx        ON blocks (day);
CREATE INDEX IF NOT EXISTS blocks_client_day_idx ON blocks (client_id, day);
CREATE INDEX IF NOT EXISTS clients_name_idx      ON clients (name);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clients_touch ON clients;
CREATE TRIGGER clients_touch BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS blocks_touch ON blocks;
CREATE TRIGGER blocks_touch BEFORE UPDATE ON blocks
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------------
-- Moving to Oracle later
-- ---------------------------------------------------------------------------
--   TEXT         -> VARCHAR2(4000)  (services may want CLOB)
--   BOOLEAN      -> NUMBER(1) with a CHECK (0,1)
--   TIMESTAMPTZ  -> TIMESTAMP WITH TIME ZONE
--   NOW()        -> SYSTIMESTAMP
--   The plpgsql trigger becomes a BEFORE UPDATE ... :NEW.updated_at :=
--   SYSTIMESTAMP; trigger. Nothing else in the app touches vendor syntax --
--   every query in src/lib/repo.ts is plain parameterised SQL.
