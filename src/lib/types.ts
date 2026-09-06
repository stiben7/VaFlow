export type Tier =
  | "Foundation"
  | "Accelerated Growth"
  | "Peak Performance"
  | "Paid Ads Only"
  | "Custom";

export const TIERS: Tier[] = [
  "Foundation",
  "Accelerated Growth",
  "Peak Performance",
  "Paid Ads Only",
  "Custom",
];

export type Priority = "high" | "normal" | "low";

export const PRIORITIES: Priority[] = ["high", "normal", "low"];

export type Client = {
  id: string;
  name: string;
  tier: Tier;
  services: string;
  strategist: string | null;
  basecampUrl: string | null;
  /** Index into ACCENTS. Stable per client so the colour never shuffles. */
  colorKey: number;
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

export type NewClient = Omit<Client, "id" | "colorKey" | "archived"> &
  Partial<Pick<Client, "colorKey" | "archived">>;

export type NewBlock = Omit<Block, "id">;

export type CalendarView = "day" | "week" | "month";
