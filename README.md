# VAFlow — client prioritizer

A week-first client manager for VAs carrying too many accounts. The roster
lives on the left, the week lives on the right, and you drag accounts onto days
until the week looks like something a person could actually do.

There are deliberately no tasks yet. The problem this solves first is *which
client gets my attention and when* — adding checklists before that question is
answered just moves the overwhelm somewhere else.

---

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. It boots straight into **My Week** with all 26
accounts already loaded — no database, no env file, no login. Everything you
schedule is saved in the browser.

---

## What's in it

**My Week** — Monday-to-Sunday grid with a 12am–11pm time axis, opened at 7:30am
so you start on the working day.

- Drag an account from the roster onto any day and time. Drops snap to 15
  minutes and land as a 1-hour block.
- Drag a block to move it; drag its bottom edge to resize it.
- Click a block for duration presets, priority, a note, and a link straight
  through to that account's Basecamp project.
- Overlapping blocks cascade side by side, so four accounts stacked on one
  morning look like the problem they are.
- Drag past the top or bottom edge and the grid auto-scrolls.
- `D` / `W` / `M` switch views, `T` jumps to today, `←` / `→` page through.
  `Esc` cancels a drag mid-flight.

**Day view** — the same grid, one column.

**Month view** — six weeks at a glance. Dragging here moves a block to a
different date and *keeps its time*, which is almost always what you meant.

**Roster panel** — search, filter by package, and a "Not yet booked" toggle that
shows only accounts with no time on the visible range. That toggle is the fastest
answer to "who am I forgetting".

**Clients** — the full A–Z list with deliverables, strategist, Basecamp links,
add and remove.

Each account keeps a fixed colour, so you start recognising accounts by colour
before you read the name. Package tier drives the badge, since tier is a decent
proxy for how much of a week an account is owed.

---

## Data

Two modes, one switch.

**Local (default)** — clients and schedule live in `localStorage`, seeded from
`src/lib/seed.ts`. Nothing to configure.

**Postgres** — the same UI talks to `/api/clients` and `/api/blocks`.

```bash
cp .env.example .env.local
# set DATABASE_URL, then:
npm run db:push            # creates tables + seeds the 26 accounts
# set NEXT_PUBLIC_DATA_MODE=api in .env.local
npm run dev
```

If `DATABASE_URL` is missing or unreachable, the API returns a clean 503 and the
app falls back to local mode with a banner rather than showing an error page.
There is a small footer line at all times saying which mode you are in.

### Supabase

Project Settings → Database → Connection string → **Transaction pooler**
(port 6543). Use the pooler URL on Vercel; the direct `:5432` URL is fine
locally. Add `DATABASE_URL` and `NEXT_PUBLIC_DATA_MODE=api` to your Vercel
environment variables and redeploy.

### Moving to Oracle

Every query is plain parameterised SQL in `src/lib/repo.ts` — no ORM, no
Postgres-specific syntax beyond `ON CONFLICT`. The type mapping and the two
trigger rewrites are noted at the bottom of `db/schema.sql`. Swapping `pg` for
`oracledb` in `src/lib/db.ts` and adjusting placeholder style (`$1` → `:1`) is
the whole job.

---

## Schema

```
clients  id, name, tier, services, strategist, basecamp_url,
         color_key, archived, created_at, updated_at

blocks   id, client_id -> clients(id) ON DELETE CASCADE,
         day (DATE), start_min, duration_min, priority, note,
         created_at, updated_at
```

`blocks.day` is a `DATE`, not a timestamp, and `start_min` is minutes from
midnight. A block dropped on Monday 9am stays Monday 9am regardless of the
server's timezone or where you're sitting. Every date in the app is keyed
`YYYY-MM-DD` in local time for the same reason.

When tasks arrive, they hang off `block_id` — the table is shaped for it.

---

## Layout of the code

```
src/lib/
  drag.tsx      pointer-event drag engine (see note below)
  store.tsx     client state, optimistic writes, local/API switch
  repo.ts       server-side SQL
  db.ts         lazy pg pool, null when DATABASE_URL is unset
  layout.ts     side-by-side layout for overlapping blocks
  date.ts       local-date helpers
  seed.ts       the 26 accounts + the dummy user
  colors.ts     8 account accents, tier badges

src/components/
  TimeGrid      day + week grid, blocks, resize, drop preview
  MonthGrid     month grid
  ClientPool    roster panel
  BlockDetail   anchored popover for one block
  Sidebar       nav, week summary, dummy user
```

**On the drag engine.** It's hand-written rather than `@dnd-kit` because a time
grid needs a continuous coordinate, not "which droppable am I over" — dropping
at 9:15 instead of 9:00 is the difference between a calendar and a board, and a
droppable-per-cell approach either loses that precision or needs hundreds of
drop zones. It's about 300 lines, has no dependencies, and handles mouse,
trackpad, pen and touch through one path.

The gesture's authoritative state lives in refs, not React state. React batches
updates from native listeners, so the state from the final `pointermove` is
usually still uncommitted when `pointerup` fires — reading the drop position
from state there gives you a stale value and the block silently fails to land.

---

## The dummy user

`DEMO_USER` in `src/lib/seed.ts` is the only place identity is referenced. When
auth lands, replace that object with the session and add a `user_id` column to
both tables.

---

## Deploying to Vercel

It builds and runs with **no environment variables at all** — a clean checkout
with an empty env goes green. Add the database later.

**Fastest — CLI, no Git needed:**

```bash
npm i -g vercel
cd vaflow
vercel          # first run links/creates the project, gives a preview URL
vercel --prod   # promote to production
```

**Or via Git:**

```bash
git init && git add -A && git commit -m "VAFlow: week-view client prioritizer"
git remote add origin <your-repo-url>
git push -u origin main
```

Then import the repo at vercel.com/new. Framework preset auto-detects as
Next.js; leave every build setting on default.

**Adding the database later** — in the Vercel project, Settings → Environment
Variables:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | your Supabase **transaction pooler** URL (port 6543) |
| `NEXT_PUBLIC_DATA_MODE` | `api` |

Run `npm run db:push` locally once against the same `DATABASE_URL` to create the
tables and seed the roster, then redeploy. Until you do, every deploy runs in
local mode and the footer says so.

Note: use the pooler URL (`:6543`), not the direct `:5432` one — serverless
functions open a connection per invocation and will exhaust a direct Postgres
connection limit.

## Stack

Next.js 15 (App Router) · React 19 · Tailwind v4 · `pg` · TypeScript strict.
Four runtime dependencies, no UI library, no icon package, no drag library.
