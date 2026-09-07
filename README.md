# VAFlow

A week first client manager for virtual assistants who carry too many accounts.
Your roster sits on the left, your week sits on the right, and you drag accounts
onto days until the week looks like something a person can actually do.

There are no tasks or checklists yet. The first problem to solve is *which
client gets my attention and when*. Adding to do lists before that is answered
just moves the overwhelm somewhere else.

Every account is private. Your clients and your schedule are yours. Nobody else
signed into the app can see them.


## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

With no environment variables the app runs in local mode: no sign in, everything
saved in your browser. That is enough to try it out. See "Turn on accounts"
below to switch to real sign in.


## What is in it

### My Week

A Monday to Sunday grid with a 12am to 11pm time axis, opened at 7:30am so you
start on the working day.

* Drag an account from the roster onto any day and time. Drops snap to 15
  minutes and land as a one hour block.
* Drag a block to move it. Drag its bottom edge to resize it.
* Drag the divider on a day header to widen or narrow that column, like a
  spreadsheet. Double click a divider to reset all of them.
* Click a block for duration presets, priority, a note, and a link straight to
  that account's Basecamp project.
* Overlapping blocks cascade side by side, so four accounts stacked on one
  morning look like the problem they are.
* Drag past the top or bottom edge and the grid scrolls on its own.
* Keys: `D` `W` `M` switch views, `T` jumps to today, `left` and `right` page
  through, `Esc` cancels a drag.

Every block shows a coloured priority dot: red for high, yellow for medium,
green for low.

### Day view

The same grid, one column.

### Month view

Six weeks at a glance. Dragging here moves a block to a different date and keeps
its time, which is almost always what you meant.

### Roster panel

Search, filter by service, and a "Not yet booked" toggle that shows only
accounts with no time on the visible range. That toggle is the fastest answer to
"who am I forgetting".

### Clients

The full A to Z list with deliverables, strategist, Basecamp links, plus add and
remove. You can also add your own service labels here; the five built in ones
(Admin, Website, Automation, General, GHL) are just defaults.

### Notes

A floating scratchpad. Open it from the tab on the right edge of the screen or
press `Ctrl/Cmd + J`. Drag its header to move it, or leave it docked. It has a
small rich text toolbar (headings, bold, italic, lists) and saves to your
browser.

### Colours

Each account keeps a fixed colour, so you start recognising clients by colour
before you read the name. Pick one of eight presets or a custom hex. A white or
near white custom colour gets a black outline so it stays visible.

### Export and import

The two small icons at the top of the roster. Export writes a JSON file of every
client and block. Import reads one back. Import matches clients by name, so
restoring a file you already restored adds nothing the second time, and blocks
are repointed at whatever ids the account actually has. That is what makes a
backup portable between accounts.


## Turn on accounts

Set two environment variables and the app switches from browser storage to real
per user accounts.

### 1. Create the tables

Supabase dashboard, then **SQL Editor**, then New query. Paste all of
[`db/schema.sql`](db/schema.sql) and Run. Safe to run more than once.

That script creates the tables and turns on row level security with policies
scoped to `auth.uid()`. Without those policies the publishable key would let
anyone read everyone's data. The security boundary is the database, not the UI.

### 2. Set the environment variables

From Project Settings, then API:

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://yourproject.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable or anon key |

Locally that is `.env.local`. On Vercel it is Settings, then Environment
Variables, then redeploy. Newer Supabase projects call it a publishable key
(`sb_publishable_...`) and older ones an anon key (a long JWT). Either works, and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is accepted as an alias.

Never put the `service_role` key in a `NEXT_PUBLIC_` variable. It bypasses row
level security.

### 3. Allow the redirect URLs

Supabase, then **Authentication**, then **URL Configuration**:

* **Site URL**: your production URL
* **Redirect URLs**: add `https://your-app.vercel.app/**` and
  `http://localhost:3000/**`

### 4. Sign in

Sign in is email and password. New visitors can also choose "Continue as guest"
to use the app with browser only storage, then sign in later to sync. When a
guest signs in, the roster offers to bring their browser data into the account
with one click.

If you want the app to be invite only, turn off open signups under
Authentication, then Sign In / Providers.


## Email reminders (optional)

Each user can get two digest emails a day: one the evening before listing
tomorrow's blocked clients, and one an hour before the day's first block listing
today's.

Sending is bring your own provider. Each person opens **Settings**, then **Email
delivery**, and enters either a Resend API key or SMTP details, then sends a test
email. No provider set up means no reminder emails for that person. There is no
central email account.

The pieces:

* Two Supabase Edge Functions, `email-config` and `reminders`, both in
  `supabase/functions/`.
* A `pg_cron` job that pokes `reminders` every 15 minutes.
* Provider secrets are stored AES-256-GCM encrypted; the key lives only in the
  Edge Function environment.

Operator setup is in
[`supabase/functions/reminders/README.md`](supabase/functions/reminders/README.md):
set `EMAIL_ENC_KEY`, deploy the two functions, and run the "Scheduler" block at
the bottom of `db/schema.sql`.


## Schema

```
profiles          user_id -> auth.users, timezone, reminders_enabled,
                  digest_hour, avatar_url

clients           id, user_id -> auth.users, name, service_tags[], services,
                  strategist, basecamp_url, color_key, color, archived

blocks            id, user_id -> auth.users,
                  client_id -> clients(id) ON DELETE CASCADE,
                  day (DATE), start_min, duration_min, priority, note

user_email_config user_id -> auth.users, provider, from_email, from_name,
                  smtp_*, secret_ciphertext, secret_nonce, verified_at,
                  last_error

daily_email_sent  user_id, email_date, kind   (reminder idempotency)
```

`blocks.day` is a `DATE`, not a timestamp, and `start_min` is minutes from
midnight. A block dropped on Monday 9am stays Monday 9am regardless of the
server's timezone or where you are sitting. Every date in the app is keyed
`YYYY-MM-DD` in local time for the same reason.


## Layout of the code

```
src/lib/
  drag.tsx      pointer event drag engine (see note below)
  store.tsx     client state, optimistic writes, Supabase or localStorage
  backup.ts     export, validation, and the id remapping import merge
  config.ts     the single place that decides cloud vs local
  supabase/     browser and server clients
  layout.ts     side by side layout for overlapping blocks
  date.ts       local date helpers
  colors.ts     8 account accents, priority colours, service tag helpers
  types.ts      shared types

src/proxy.ts    session refresh, the auth gate, guest cookie

src/app/
  (app)/        the signed in shell: my-week, clients
  login/        sign in, sign up, continue as guest
  auth/         confirm and signout route handlers

src/components/
  TimeGrid        day and week grid, blocks, resize, drop preview
  MonthGrid       month grid
  ClientPool      roster, export and import, onboarding
  BlockDetail     anchored popover for one block
  ClientDialog    add and edit a client
  Sidebar         nav, week summary, identity, settings cog
  SettingsDialog  photo, password, email delivery, reminders, log out
  NotesPanel      the floating scratchpad
  Logo, Icons     inline SVG, no icon package

supabase/functions/
  reminders/      the two daily digest emails
  email-config/   save and test a user's email provider
```

### On the drag engine

It is hand written rather than a library because a time grid needs a continuous
coordinate, not "which droppable am I over". Dropping at 9:15 instead of 9:00 is
the difference between a calendar and a board. It is about 300 lines, has no
dependencies, and handles mouse, trackpad, pen and touch through one path.

The gesture's authoritative state lives in refs, not React state. React batches
updates from native listeners, so the state from the final `pointermove` is
usually still uncommitted when `pointerup` fires. Reading the drop position from
state there gives you a stale value and the block silently fails to land.

### On the auth gate

`src/proxy.ts` calls `getUser()`, not `getSession()`. `getSession()` trusts the
cookie as is; `getUser()` revalidates it against Supabase, so a forged or
expired cookie cannot walk past. The `setAll` handler copies the cache control
headers Supabase hands it onto the response. Skip those and a CDN can cache a
response that sets auth cookies and serve one person's session to somebody else.


## Deploying to Vercel

Builds and runs with no environment variables at all. A clean checkout with an
empty env goes green in local mode. Add the Supabase pair when you want
accounts.

CLI, no Git needed:

```bash
npm i -g vercel
vercel          # links or creates the project, gives a preview URL
vercel --prod   # promote to production
```

Or via Git: push the repo, import at vercel.com/new. Framework preset auto
detects as Next.js. Leave every build setting on default.

Each preview deployment gets its own URL. With accounts on, add the preview
wildcard to Supabase's redirect URLs or sign in will only work on production.


## Stack

Next.js 16 (App Router), React 19, Tailwind v4, `@supabase/ssr`, TypeScript
strict. A handful of runtime dependencies, no UI library, no icon package, no
drag library.

Versions are pinned via `package-lock.json`. Commit it so Vercel installs
exactly what was tested.
