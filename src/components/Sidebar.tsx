"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { DEMO_USER } from "@/lib/seed";
import { toKey, weekDays } from "@/lib/date";
import {
  CalendarIcon,
  UsersIcon,
  SidebarIcon,
  InboxIcon,
} from "./Icons";

const NAV = [
  { href: "/my-week", label: "My Week", Icon: CalendarIcon },
  { href: "/clients", label: "Clients", Icon: UsersIcon },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { clients, blocks, ready } = useStore();
  const [collapsed, setCollapsed] = useState(false);

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
        <div className="mt-auto grid h-8 w-8 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white">
          {DEMO_USER.initials}
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
          <div className="truncate text-[11px] text-faint">SmartVAs</div>
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
              {summary.placed === 0
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

      {/* Dummy identity. Replace with the real session once auth lands. */}
      <div className="m-2.5 flex items-center gap-2.5 rounded-lg border border-edge bg-canvas p-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white">
          {DEMO_USER.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium text-ink">
            {DEMO_USER.name}
          </div>
          <div className="truncate text-[11px] text-faint">{DEMO_USER.role}</div>
        </div>
      </div>
    </aside>
  );
}
