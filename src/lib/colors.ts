import type { CSSProperties } from "react";
import type { ServiceTag, Priority } from "./types";

/**
 * Eight muted accents. Each client gets one permanently (colorKey), the way
 * Asana pins a colour to a project -- so you learn to recognise a client by
 * its colour before you read the name.
 *
 * Every value is a literal Tailwind class string, not a template, so the
 * Tailwind scanner can see them. A client may instead carry a custom hex
 * `color`; see `accentFor` and the `.accent-custom*` rules in globals.css.
 */
export type Accent = {
  /** Card surface in the pool + calendar. */
  chip: string;
  /** 3px left rule on the card. */
  bar: string;
  /** Solid dot / avatar. */
  dot: string;
  /** Text on the chip surface. */
  text: string;
  /** Ring shown while a card is being dragged or is selected. */
  ring: string;
  /**
   * Only set for a custom hex colour: put this on whichever element carries
   * the accent classes above (or their common ancestor), so the CSS vars
   * cascade down.
   */
  style?: CSSProperties;
};

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const ACCENTS: Accent[] = [
  {
    chip: "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900",
    bar: "bg-rose-400",
    dot: "bg-rose-500",
    text: "text-rose-950 dark:text-rose-100",
    ring: "ring-rose-400",
  },
  {
    chip: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900",
    bar: "bg-amber-400",
    dot: "bg-amber-500",
    text: "text-amber-950 dark:text-amber-100",
    ring: "ring-amber-400",
  },
  {
    chip: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900",
    bar: "bg-emerald-400",
    dot: "bg-emerald-500",
    text: "text-emerald-950 dark:text-emerald-100",
    ring: "ring-emerald-400",
  },
  {
    chip: "bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900",
    bar: "bg-sky-400",
    dot: "bg-sky-500",
    text: "text-sky-950 dark:text-sky-100",
    ring: "ring-sky-400",
  },
  {
    chip: "bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-900",
    bar: "bg-violet-400",
    dot: "bg-violet-500",
    text: "text-violet-950 dark:text-violet-100",
    ring: "ring-violet-400",
  },
  {
    chip: "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900",
    bar: "bg-teal-400",
    dot: "bg-teal-500",
    text: "text-teal-950 dark:text-teal-100",
    ring: "ring-teal-400",
  },
  {
    chip: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-900",
    bar: "bg-orange-400",
    dot: "bg-orange-500",
    text: "text-orange-950 dark:text-orange-100",
    ring: "ring-orange-400",
  },
  {
    chip: "bg-fuchsia-50 dark:bg-fuchsia-950/40 border-fuchsia-200 dark:border-fuchsia-900",
    bar: "bg-fuchsia-400",
    dot: "bg-fuchsia-500",
    text: "text-fuchsia-950 dark:text-fuchsia-100",
    ring: "ring-fuchsia-400",
  },
];

const CUSTOM_ACCENT: Accent = {
  chip: "accent-custom",
  bar: "accent-custom-bar",
  dot: "accent-custom-dot",
  text: "accent-custom-text",
  ring: "accent-custom-ring",
};

/**
 * The accent for a client. Pass the whole client (or a `{ colorKey, color }`
 * pair): a valid custom hex wins, otherwise it falls back to the preset at
 * `colorKey`. A bare number is still accepted for callers that only have one.
 */
export function accentFor(
  input: number | { colorKey: number; color?: string | null }
): Accent {
  if (typeof input === "number") {
    return ACCENTS[((input % ACCENTS.length) + ACCENTS.length) % ACCENTS.length];
  }
  if (input.color && HEX_RE.test(input.color)) {
    const style = { "--accent": input.color } as CSSProperties;
    return { ...CUSTOM_ACCENT, style };
  }
  return ACCENTS[
    ((input.colorKey % ACCENTS.length) + ACCENTS.length) % ACCENTS.length
  ];
}

/**
 * Availed-service badge styling -- one muted colour per service so the tags
 * stay legible when several sit in a row.
 */
export const SERVICE_BADGE: Record<ServiceTag, string> = {
  Admin: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  Website:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  Automation:
    "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  General: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  GHL: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

export const PRIORITY_META: Record<
  Priority,
  { label: string; dot: string; flag: string }
> = {
  high: { label: "High", dot: "bg-red-500", flag: "text-red-500" },
  normal: { label: "Normal", dot: "bg-slate-300", flag: "text-slate-400" },
  low: { label: "Low", dot: "bg-slate-200", flag: "text-slate-300" },
};
