/**
 * What the account has actually signed up for. A client can have any
 * combination -- e.g. Website + Automation + GHL -- so this is a set, not a
 * single tier.
 */
export type ServiceTag =
  | "Admin"
  | "Website"
  | "Automation"
  | "General"
  | "GHL";

export const SERVICE_TAGS: ServiceTag[] = [
  "Admin",
  "Website",
  "Automation",
  "General",
  "GHL",
];

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

export type NewClient = Omit<
  Client,
  "id" | "colorKey" | "color" | "archived"
> &
  Partial<Pick<Client, "colorKey" | "color" | "archived">>;

export type NewBlock = Omit<Block, "id">;

export type CalendarView = "day" | "week" | "month";
