"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/config";
import { toKey, weekDays } from "@/lib/date";
import {
  CalendarIcon,
  UsersIcon,
  ChartIcon,
  SidebarIcon,
  InboxIcon,
  SettingsIcon,
  CameraIcon,
} from "./Icons";
import UserMenu from "./UserMenu";

const NAV = [
  { href: "/my-week", label: "My Week", Icon: CalendarIcon },
  { href: "/clients", label: "Clients", Icon: UsersIcon },
  { href: "/dashboard", label: "Dashboard", Icon: ChartIcon },
];

const STORAGE_KEY = "vaflow.sidebar";

const COLLAPSED_W = 60;
const EXPANDED_W = 240;

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

function Avatar({
  src,
  initials,
  className,
}: {
  src: string | null;
  initials: string;
  className: string;
}) {
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand font-semibold text-white ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { clients, blocks, ready, user, mode, profile, uploadAvatar } =
    useStore();

  // Start expanded on the server; adopt the stored choice before first paint
  // (useLayoutEffect) so the transition never plays a wrong-state flash. The
  // `mounted` flag is flipped a frame later so the initial width lands without
  // an animation.
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
    } catch {
      /* private mode -- stay expanded */
    }
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* best effort */
      }
      return next;
    });
  };

  const email = user?.email ?? null;
  const isCloud = mode === "cloud";
  const isGuest = mode === "local" && isSupabaseConfigured;
  const avatar = profile?.avatarUrl ?? null;
  const initials = mode === "cloud" ? initialsFor(email) : isGuest ? "GU" : "LO";
  const displayName =
    mode === "cloud" ? (email ?? "Signed in") : isGuest ? "Guest" : "Local mode";
  const displaySub =
    mode === "cloud" ? "Your private workspace" : "Saved in this browser";

  const summary = useMemo(() => {
    const keys = new Set(weekDays(new Date()).map(toKey));
    const scheduled = new Set(
      blocks.filter((b) => keys.has(b.date)).map((b) => b.clientId)
    );
    const active = clients.filter((c) => !c.archived);
    return { placed: scheduled.size, total: active.length };
  }, [blocks, clients]);

  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 3 * 1024 * 1024) {
      setAvatarErr("Image, under 3 MB.");
      return;
    }
    setAvatarErr(null);
    try {
      await uploadAvatar(file);
    } catch {
      setAvatarErr("Upload failed.");
    }
  }

  const fade = "transition-opacity duration-150 motion-reduce:transition-none";
  const hidden = collapsed ? `pointer-events-none opacity-0 ${fade}` : `opacity-100 ${fade}`;

  return (
    <aside
      style={{ width: collapsed ? COLLAPSED_W : EXPANDED_W }}
      className={`relative flex shrink-0 flex-col border-r border-edge bg-panel ${
        mounted
          ? "transition-[width] duration-200 ease-in-out motion-reduce:transition-none"
          : ""
      }`}
    >
      {/* Collapse toggle -- pinned top-right; centres itself when collapsed */}
      <button
        onClick={toggle}
        className={`absolute top-3.5 z-10 rounded-md p-1.5 text-faint hover:bg-sunken hover:text-ink ${
          collapsed ? "left-1/2 -translate-x-1/2" : "right-2.5"
        }`}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <SidebarIcon />
      </button>

      {/* Everything above the identity strip clips as the rail narrows. The
          strip stays outside the clip so its quick-menu can overflow. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Brand -- the whole row fades on collapse, leaving just the toggle */}
      <div
        className={`flex h-[52px] shrink-0 items-center gap-2 pl-4 pr-11 ${hidden}`}
      >
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand text-[13px] font-bold text-white">
          V
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold tracking-tight text-ink">
            VAFlow
          </div>
          <div className="truncate text-[11px] text-faint">Client prioritizer</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="px-2.5 pt-1">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`mb-0.5 flex items-center gap-2.5 overflow-hidden rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors ${
                active
                  ? "bg-brand-soft text-brand-ink"
                  : "text-muted hover:bg-sunken hover:text-ink"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={`flex-1 whitespace-nowrap ${hidden}`}>{label}</span>
              {href === "/clients" && ready && (
                <span
                  className={`text-[11px] font-normal tabular-nums text-faint ${hidden}`}
                >
                  {clients.filter((c) => !c.archived).length}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* This week at a glance -- collapses its own height when the rail shrinks */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out motion-reduce:transition-none ${
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className={`mx-2.5 mt-5 rounded-lg border border-edge bg-canvas p-3 ${hidden}`}>
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
                        summary.total
                          ? (summary.placed / summary.total) * 100
                          : 0
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
        </div>
      </div>

        <div className="flex-1" />
      </div>

      {/* Identity + quick-menu */}
      <div
        className={`m-2.5 flex shrink-0 items-center rounded-lg border border-edge bg-canvas ${
          collapsed ? "justify-center p-1.5" : "gap-2.5 p-2"
        }`}
      >
        {isCloud ? (
          collapsed ? (
            <UserMenu
              guest={false}
              align="left"
              triggerAriaLabel="Account menu"
              triggerClassName="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <Avatar
                src={avatar}
                initials={initials}
                className="h-8 w-8 text-[11px]"
              />
            </UserMenu>
          ) : (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title="Change photo"
                aria-label="Change profile photo"
                className="group relative h-9 w-9 shrink-0 overflow-hidden rounded-full"
              >
                <Avatar
                  src={avatar}
                  initials={initials}
                  className="h-9 w-9 text-[12px]"
                />
                <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                  <CameraIcon className="h-4 w-4 text-white" />
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onFile}
                className="hidden"
              />
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-[12.5px] font-medium text-ink"
                  title={displayName}
                >
                  {avatarErr ?? displayName}
                </div>
                <div className="truncate text-[11px] text-faint">
                  {displaySub}
                </div>
              </div>
              <UserMenu
                guest={false}
                align="right"
                triggerAriaLabel="Settings"
                triggerHref="/settings#profile"
                triggerClassName="shrink-0 rounded-md p-1.5 text-faint transition-colors hover:bg-sunken hover:text-ink"
              >
                <SettingsIcon className="h-4 w-4 shrink-0 transition-transform duration-300 ease-out group-hover:rotate-90" />
              </UserMenu>
            </>
          )
        ) : collapsed ? (
          <UserMenu
            guest
            align="left"
            triggerAriaLabel="Menu"
            triggerClassName="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <Avatar
              src={null}
              initials={initials}
              className="h-8 w-8 text-[11px]"
            />
          </UserMenu>
        ) : (
          <>
            <UserMenu
              guest
              align="left"
              triggerAriaLabel="Menu"
              triggerClassName="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <Avatar
                src={null}
                initials={initials}
                className="h-9 w-9 text-[12px]"
              />
            </UserMenu>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium text-ink">
                {displayName}
              </div>
              <div className="truncate text-[11px] text-faint">{displaySub}</div>
            </div>
            {isGuest && (
              <Link
                href="/login"
                className="shrink-0 rounded-md border border-brand/40 bg-brand-soft px-2 py-1 text-[11px] font-medium text-brand-ink transition-colors hover:bg-brand/10"
              >
                Sign in
              </Link>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
