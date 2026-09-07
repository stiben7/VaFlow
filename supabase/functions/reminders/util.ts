// Timezone math + email HTML. No dependencies -- everything rides on Intl,
// which carries the full IANA/DST database.

export type BlockRow = {
  id: string;
  user_id: string;
  day: string; // 'YYYY-MM-DD'
  start_min: number; // minutes from local midnight
  duration_min: number;
  priority: "high" | "normal" | "low";
  note: string | null;
  clients: { name: string } | null;
};

// ---------------------------------------------------------------------------
// dates
// ---------------------------------------------------------------------------

/** Add whole days to a plain 'YYYY-MM-DD' string (no timezone involved). */
export function addLocalDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** The user's local date ('YYYY-MM-DD') and hour (0-23) at instant `now`. */
export function localParts(now: Date, tz: string): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0; // some engines emit '24' at midnight
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour };
}

/** ms to add to a UTC-labelled wall clock to get the real instant in `tz`. */
function tzOffsetMs(at: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const asIfUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return asIfUTC - at.getTime();
}

/**
 * The real UTC instant for a wall-clock time (`dateStr` + `startMin`) in `tz`.
 * DST-correct: refines once so the offset used is the one in effect at the
 * resolved instant, not at the naive guess.
 */
export function zonedWallClockToInstant(
  dateStr: string,
  startMin: number,
  tz: string,
): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const asUTC = Date.UTC(y, m - 1, d, Math.floor(startMin / 60), startMin % 60, 0);
  const off1 = tzOffsetMs(new Date(asUTC), tz);
  let instant = asUTC - off1;
  const off2 = tzOffsetMs(new Date(instant), tz);
  if (off2 !== off1) instant = asUTC - off2;
  return new Date(instant);
}

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 540 -> "9:00 AM", 810 -> "1:30 PM" (matches the app's src/lib/date.ts). */
export function formatTime(minutes: number): string {
  const total = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** '2026-09-08' -> "Tuesday, Sep 8". */
export function prettyDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd}, ${MONTHS[m - 1]} ${d}`;
}

/** Best-effort first name from an email local part; "there" if nothing usable. */
export function nameFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "").split(/[.\-_+]/)[0].replace(/[^a-zA-Z]/g, "");
  if (local.length < 2) return "there";
  return local[0].toUpperCase() + local.slice(1).toLowerCase();
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

// ---------------------------------------------------------------------------
// templates
// ---------------------------------------------------------------------------

function blockRows(blocks: BlockRow[]): string {
  return blocks
    .map((b) => {
      const name = esc(b.clients?.name ?? "Unknown client");
      const time = formatTime(b.start_min);
      const high =
        b.priority === "high"
          ? ` <span style="font-size:10px;font-weight:700;color:#b91c1c;background:#fee2e2;border-radius:4px;padding:1px 5px;vertical-align:middle;">HIGH</span>`
          : "";
      const note = b.note
        ? `<div style="font-size:13px;color:#57534e;margin:2px 0 0 0;">${esc(b.note)}</div>`
        : "";
      return `
        <tr>
          <td style="padding:10px 0;border-top:1px solid #ececec;vertical-align:top;">
            <div style="font-size:14px;color:#1c1917;">
              <span style="font-variant-numeric:tabular-nums;color:#78716c;">${time}</span>
              &nbsp;&middot;&nbsp;<strong>${name}</strong>${high}
            </div>
            ${note}
          </td>
        </tr>`;
    })
    .join("");
}

function shell(inner: string, tz: string): string {
  return `<!doctype html><html><body style="margin:0;background:#faf9f7;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #ececec;border-radius:12px;">
    <tr><td style="padding:22px 24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
        <span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;background:#4f46e5;color:#fff;font-weight:700;border-radius:7px;font-size:13px;">V</span>
        <span style="font-size:13px;font-weight:600;color:#1c1917;">VAFlow</span>
      </div>
      ${inner}
    </td></tr>
  </table>
  <div style="max-width:520px;margin:12px auto 0;font-size:11px;color:#a8a29e;text-align:center;">
    Sent in your timezone (${esc(tz)}). Manage these in VAFlow &rarr; Settings &rarr; Email reminders.
  </div>
</body></html>`;
}

export function eveningDigestHtml(
  name: string,
  tomorrow: string,
  blocks: BlockRow[],
  tz: string,
): string {
  return shell(
    `<h1 style="font-size:16px;color:#1c1917;margin:0 0 4px;">Your priority clients for tomorrow</h1>
     <p style="font-size:13px;color:#57534e;margin:0 0 6px;">Hi ${esc(name)}, here's who you've blocked time for on ${prettyDate(tomorrow)}:</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${blockRows(blocks)}</table>`,
    tz,
  );
}

export function morningDigestHtml(
  name: string,
  today: string,
  blocks: BlockRow[],
  tz: string,
): string {
  const first = blocks[0] ? formatTime(blocks[0].start_min) : "";
  return shell(
    `<h1 style="font-size:16px;color:#1c1917;margin:0 0 4px;">Your priority clients for today</h1>
     <p style="font-size:13px;color:#57534e;margin:0 0 6px;">Hello ${esc(name)}, here's your day (${prettyDate(today)}). First up at ${first}:</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${blockRows(blocks)}</table>`,
    tz,
  );
}
