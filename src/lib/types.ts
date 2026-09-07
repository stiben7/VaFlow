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
  services: string;
  strategist: string | null;
  basecampUrl: string | null;
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
};

export type NewClient = Omit<
  Client,
  "id" | "colorKey" | "color" | "archived"
> &
  Partial<Pick<Client, "colorKey" | "color" | "archived">>;

export type NewBlock = Omit<Block, "id">;

export type CalendarView = "day" | "week" | "month";
