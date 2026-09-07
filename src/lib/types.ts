/**
 * What the account has actually signed up for. A client can have any
 * combination -- e.g. Website + Automation + GHL -- so this is a set, not a
 * single tier. The five below ship as defaults; a user can add their own
 * labels, so this is just `string`.
 */
export type ServiceTag = string;

export const SERVICE_TAGS = [
  "Admin",
  "Website",
  "Automation",
  "General",
  "GHL",
] as const;

/**
 * The default labels plus every custom one currently used by a client,
 * defaults first and the rest alphabetised. Feed it every client's
 * `serviceTags`.
 */
export function mergeServiceTags(
  used: readonly (readonly string[])[]
): string[] {
  const seen = new Set<string>(SERVICE_TAGS);
  const extra: string[] = [];
  for (const list of used) {
    for (const raw of list) {
      const t = raw.trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        extra.push(t);
      }
    }
  }
  extra.sort((a, b) => a.localeCompare(b));
  return [...SERVICE_TAGS, ...extra];
}

export type Priority = "high" | "normal" | "low";

export const PRIORITIES: Priority[] = ["high", "normal", "low"];

export type Client = {
  id: string;
  name: string;
  /** Availed services. Empty is allowed -- a client added before any were picked. */
  serviceTags: ServiceTag[];
  /** Free text: deliverables, extra links, anything. URLs render clickable. */
  notes: string;
  /** Project / workspace URL (Basecamp, Teamwork, ClickUp, ...). */
  link: string | null;
  /** Index into ACCENTS. Stable per client so the colour never shuffles. */
  colorKey: number;
  /** Custom hex ("#rrggbb"); when set it overrides the preset at colorKey. */
  color: string | null;
  archived: boolean;
};

export type Block = {
  id: string;
  clientId: string;
  /** Local calendar date, "YYYY-MM-DD". Never a UTC timestamp. */
  date: string;
  /** Minutes from midnight, 0-1425. */
  startMin: number;
  /** Minutes. Minimum 15. */
  durationMin: number;
  priority: Priority;
  note: string | null;
};

/**
 * Per-user settings, kept in the `profiles` table (cloud mode only).
 * `timezone` is the browser's IANA name, captured on load; the reminder job
 * needs it to know when "one hour before 9am" actually is.
 */
export type Profile = {
  timezone: string | null;
  remindersEnabled: boolean;
  /** Local hour (0-23) the evening "tomorrow" digest goes out. */
  digestHour: number;
  /** Public URL of the uploaded avatar, or null for initials. */
  avatarUrl: string | null;
};

export type EmailProvider = "resend" | "smtp";

/**
 * The user's own email sending provider, as the browser sees it: never the
 * secret (SMTP password / API key) -- that only ever lives encrypted in the
 * DB and decrypted inside the Edge Functions.
 */
export type EmailConfig = {
  configured: boolean;
  provider: EmailProvider | null;
  fromEmail: string | null;
  fromName: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpSecure: boolean;
  /** Set after a successful test/send; null means "saved but never verified". */
  verifiedAt: string | null;
  lastError: string | null;
};

/** What the Settings form submits to the `email-config` Edge Function. */
export type EmailConfigInput = {
  provider: EmailProvider;
  fromEmail: string;
  fromName: string;
  /** The SMTP password or the Resend API key. */
  secret: string;
  smtp?: {
    host: string;
    port: number;
    user: string;
    secure: boolean;
  };
};

export type NewClient = Omit<
  Client,
  "id" | "colorKey" | "color" | "archived"
> &
  Partial<Pick<Client, "colorKey" | "color" | "archived">>;

export type NewBlock = Omit<Block, "id">;

export type CalendarView = "day" | "week" | "month";
