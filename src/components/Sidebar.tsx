"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { toKey, weekDays } from "@/lib/date";
import {
  CalendarIcon,
  UsersIcon,
  SidebarIcon,
  InboxIcon,
  LogoutIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
} from "./Icons";

const NAV = [
  { href: "/my-week", label: "My Week", Icon: CalendarIcon },
  { href: "/clients", label: "Clients", Icon: UsersIcon },
];

/** "ven@smartvas.com" -> "VE". Falls back cleanly for odd addresses. */
function initialsFor(email: string | null | undefined): string {
  if (!email) return "??";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase() || "??";
}

const THEME_OPTIONS: { value: ThemeChoice; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { clients, blocks, ready, user, mode } = useStore();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  const email = user?.email ?? null;
  const initials = mode === "cloud" ? initialsFor(email) : "LO";
  const displayName = mode === "cloud" ? (email ?? "Signed in") : "Local mode";
  const displaySub =
    mode === "cloud" ? "Your private workspace" : "Saved in this browser";

  // Two numbers that answer "am I on top of this week?" without opening anything.
  const summary = useMemo(() => {
    const keys = new Set(weekDays(new Date()).map(toKey));
    const scheduled = new Set(
      blocks.filter((b) => keys.has(b.date)).map((b) => b.clientId)
    );
    const active = clients.filter((c) => !c.archived);
    return { placed: scheduled.size, total: active.length };
  }, [blocks, clients]);

  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-edge bg-panel py-3">
        <button
          onClick={() => setCollapsed(false)}
          className="rounded-md p-2 text-muted hover:bg-sunken hover:text-ink"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <SidebarIcon />
        </button>
        <div className="mt-2 flex flex-col gap-1">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                aria-label={label}
                className={`rounded-md p-2 transition-colors ${
                  active
                    ? "bg-brand-soft text-brand-ink"
                    : "text-muted hover:bg-sunken hover:text-ink"
                }`}
              >
                <Icon />
              </Link>
            );
          })}
        </div>
        <button
          onClick={() => {
            const next =
              theme === "system" ? "light" : theme === "light" ? "dark" : "system";
            setTheme(next);
          }}
          title={`Theme: ${theme}`}
          aria-label="Toggle theme"
          className="mt-auto rounded-md p-2 text-muted hover:bg-sunken hover:text-ink"
        >
          {theme === "dark" ? (
            <MoonIcon />
          ) : theme === "light" ? (
            <SunIcon />
          ) : (
            <MonitorIcon />
          )}
        </button>
        <div
          title={displayName}
          className="mt-1 grid h-8 w-8 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white"
        >
          {initials}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-edge bg-panel">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-[13px] font-bold text-white">
          V
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold tracking-tight text-ink">
            VAFlow
          </div>
          <div className="truncate text-[11px] text-faint">Client prioritizer</div>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="rounded-md p-1.5 text-faint hover:bg-sunken hover:text-ink"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          <SidebarIcon />
        </button>
      </div>

      {/* Nav */}
      <nav className="px-2.5 pt-1">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors ${
                active
                  ? "bg-brand-soft text-brand-ink"
                  : "text-muted hover:bg-sunken hover:text-ink"
              }`}
            >
              <Icon />
              <span>{label}</span>
              {href === "/clients" && ready && (
                <span className="ml-auto text-[11px] font-normal tabular-nums text-faint">
                  {clients.filter((c) => !c.archived).length}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* This week at a glance */}
      <div className="mx-2.5 mt-5 rounded-lg border border-edge bg-canvas p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
          <InboxIcon className="h-3.5 w-3.5" />
          This week
        </div>
        {ready ? (
          <>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tabular-nums leading-none text-ink">
                {summary.placed}
              </span>
              <span className="text-[12px] text-muted">
                of {summary.total} placed
              </span>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-sunken">
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-300"
                style={{
                  width: `${
                    summary.total ? (summary.placed / summary.total) * 100 : 0
                  }%`,
                }}
              />
            </div>
            <p className="mt-2 text-[11px] leading-snug text-faint">
              {summary.total === 0
                ? "No accounts yet. Add one to get started."
                : summary.placed === 0
                  ? "Nothing scheduled yet. Drag a client onto the grid."
                  : summary.placed === summary.total
                    ? "Every account has time on the calendar."
                    : `${summary.total - summary.placed} accounts have no time booked.`}
            </p>
          </>
        ) : (
          <div className="mt-3 h-10 animate-pulse rounded bg-sunken" />
        )}
      </div>

      <div className="flex-1" />

      {/* Theme toggle */}
      <div className="mx-2.5 mb-2">
        <div className="flex rounded-lg border border-edge bg-canvas p-0.5">
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              title={`${label} theme`}
              aria-label={`${label} theme`}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-medium transition-colors ${
                theme === value
                  ? "bg-sunken text-ink shadow-sm"
                  : "text-faint hover:text-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Identity */}
      <div className="m-2.5 rounded-lg border border-edge bg-canvas p-2.5">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium text-ink" title={displayName}>
              {displayName}
            </div>
            <div className="truncate text-[11px] text-faint">{displaySub}</div>
          </div>
        </div>
        {mode === "cloud" && (
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-edge py-1.5 text-[11.5px] font-medium text-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              <LogoutIcon className="h-3.5 w-3.5" />
              Sign out
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}
