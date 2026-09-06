# VAFlow — client prioritizer

A week-first client manager for VAs carrying too many accounts. Your roster
lives on the left, your week lives on the right, and you drag accounts onto
days until the week looks like something a person could actually do.

There are deliberately no tasks yet. The problem this solves first is *which
client gets my attention and when* — adding checklists before that question is
answered just moves the overwhelm somewhere else.

Every account is private. Your clients and your schedule are yours; nobody
else signed into the app can see them.

---

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no environment variables it runs in **local
mode** — no sign-in, sample roster loaded, everything saved in your browser.
Good for trying it out; see *Accounts* below to turn on real sign-in.

---

## What's in it

**My Week** — Monday-to-Sunday grid with a 12am–11pm time axis, opened at
7:30am so you start on the working day.

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

**Roster panel** — search, filter by package, and a "Not yet booked" toggle
that shows only accounts with no time on the visible range. That toggle is the
fastest answer to "who am I forgetting".

**Clients** — the full A–Z list with deliverables, strategist, Basecamp links,
add and remove.

**Export / Import** — the two small icons at the top of the roster. Export
writes a JSON file of every client and block; import reads one back. Import
matches clients by name, so restoring a file you already restored adds nothing
the second time, and blocks are repointed at whatever ids the account actually
has. That last part is what makes a backup portable between accounts.

Each account keeps a fixed colour, so you start recognising clients by colour
before you read the name. Package tier drives the badge, since tier is a decent
proxy for how much of a week an account is owed.

---

## Accounts

Set two environment variables and the app switches from browser storage to real
per-user accounts.

### 1. Create the tables

Supabase dashboard → **SQL Editor** → New query → paste all of
[`db/schema.sql`](db/schema.sql) → **Run**. Safe to run more than once.

That script creates `clients` and `blocks`, and — the important part — turns on
row level security with policies scoped to `auth.uid()`. Without those
policies the publishable key would let anyone read everyone's data. The
security boundary is the database, not the UI.

### 2. Set the environment variables

From Project Settings → API:

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://yourproject.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable / anon key |

Locally that's `.env.local`; on Vercel it's Settings → Environment Variables,
then redeploy. Newer Supabase projects call it a *publishable* key
(`sb_publishable_…`) and older ones an *anon* key (a long JWT) — either works,
and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is accepted as an alias.

Never put the `service_role` key in a `NEXT_PUBLIC_` variable. It bypasses RLS.

### 3. Allow the redirect URL

Supabase → **Authentication → URL Configuration**:

- **Site URL**: your production URL
- **Redirect URLs**: add `https://your-app.vercel.app/**` and
  `http://localhost:3000/**`

Miss this and the magic link will bounce to the wrong host and sign-in will
appear to silently fail.

### 4. Sign in

Sign-in is a magic link — enter an email, get a link, click it. No passwords to
store or reset.

Two things worth knowing before you invite anyone: Supabase's built-in email
sender is rate-limited to a couple of messages an hour, which is fine for you
and immediately not fine for a team — wire up your own SMTP under
Authentication → Emails. And unless you turn off open signups
(Authentication → Sign In / Providers), anyone who knows the URL can create an
account. They'd see only their own empty workspace, but they'd still be a row
in your `auth.users`.

### Moving your existing data in

If you were using the app in local mode on the same domain, sign in and the
roster panel offers to import what's already in that browser — one click, no
file. Otherwise: export to JSON before switching, then import after signing in.

---

## Schema

```
clients  id, user_id -> auth.users, name, tier, services, strategist,
         basecamp_url, color_key, archived, created_at, updated_at

blocks   id, user_id -> auth.users,
         client_id -> clients(id) ON DELETE CASCADE,
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
  store.tsx     client state, optimistic writes, Supabase or localStorage
  backup.ts     export, validation, and the id-remapping import merge
  config.ts     the single place that decides cloud vs local
  supabase/     browser and server clients
  layout.ts     side-by-side layout for overlapping blocks
  date.ts       local-date helpers
  seed.ts       the 26 sample accounts
  colors.ts     8 account accents, tier badges

src/proxy.ts    session refresh + the auth gate

src/app/
  (app)/        the signed-in shell: my-week, clients
  login/        magic-link sign-in
  auth/         confirm + signout route handlers

src/components/
  TimeGrid      day + week grid, blocks, resize, drop preview
  MonthGrid     month grid
  ClientPool    roster, export/import, onboarding
  BlockDetail   anchored popover for one block
  Sidebar       nav, week summary, identity, sign out
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

**On the auth gate.** `src/proxy.ts` calls `getUser()`, not `getSession()`.
`getSession()` trusts the cookie as-is; `getUser()` revalidates it against
Supabase, so a forged or expired cookie can't walk past. The `setAll` handler
copies the cache-control headers Supabase hands it onto the response — skip
those and a CDN can cache a response that sets auth cookies and serve one
person's session to somebody else.

---

## Deploying to Vercel

Builds and runs with **no environment variables at all** — a clean checkout
with an empty env goes green in local mode. Add the Supabase pair when you want
accounts.

**CLI, no Git needed:**

```bash
npm i -g vercel
vercel          # links/creates the project, gives a preview URL
vercel --prod   # promote to production
```

**Or via Git:** push the repo, import at vercel.com/new. Framework preset
auto-detects as Next.js; leave every build setting on default.

Note that each preview deployment gets its own URL. In local mode that means a
preview shows an empty calendar, because browser storage is per-origin. With
accounts on, add the preview wildcard to Supabase's redirect URLs or sign-in
will only work on production.

## Stack

Next.js 16.3.4 (App Router) · React 19.2.8 · Tailwind v4 · `@supabase/ssr` ·
TypeScript strict. Four runtime dependencies, no UI library, no icon package,
no drag library. `npm audit` clean.

Versions are pinned via `package-lock.json` — commit it, so Vercel installs
exactly what was tested.
