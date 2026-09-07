"use client";

/**
 * The quick-menu behind the sidebar cog (and, when the sidebar is collapsed,
 * behind the avatar). Opens *upward* -- it sits at the bottom of the strip --
 * on hover or click, with fast shortcuts: theme, Settings, Email delivery,
 * Log out. Everything here is one tap from where the eye already is.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import {
  EnterDoorIcon,
  LogoutIcon,
  MailIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
} from "./Icons";

const THEME_OPTIONS: { value: ThemeChoice; label: string; Icon: typeof SunIcon }[] =
  [
    { value: "light", label: "Light", Icon: SunIcon },
    { value: "system", label: "Auto", Icon: MonitorIcon },
    { value: "dark", label: "Dark", Icon: MoonIcon },
  ];

export default function UserMenu({
  guest,
  align = "left",
  triggerClassName,
  triggerAriaLabel,
  triggerHref,
  children,
}: {
  guest: boolean;
  align?: "left" | "right";
  triggerClassName?: string;
  triggerAriaLabel: string;
  /**
   * When set, clicking the trigger navigates here instead of toggling the
   * menu. Hover still opens the menu -- the click is the primary action, the
   * menu is the shortcut layer.
   */
  triggerHref?: string;
  children: React.ReactNode;
}) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the popup in the DOM through its leave transition.
  useEffect(() => {
    if (open) {
      setMounted(true);
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    } else if (mounted) {
      timer.current = setTimeout(() => setMounted(false), 200);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
    >
      {triggerHref ? (
        <Link
          href={triggerHref}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={triggerAriaLabel}
          onClick={close}
          className={`group ${triggerClassName ?? ""}`}
        >
          {children}
        </Link>
      ) : (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={triggerAriaLabel}
          onClick={() => setOpen((o) => !o)}
          className={`group ${triggerClassName ?? ""}`}
        >
          {children}
        </button>
      )}

      {mounted && (
        <div
          className={`absolute bottom-full z-50 pb-2 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div
            role="menu"
            data-open={open || undefined}
            className="w-52 origin-bottom translate-y-1 rounded-lg border border-edge bg-canvas p-1 opacity-0 shadow-xl transition-[opacity,transform] duration-150 ease-out data-[open]:translate-y-0 data-[open]:opacity-100 motion-reduce:transition-none"
          >
            {/* Theme */}
            <div className="px-1 py-1">
              <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-faint">
                Theme
              </div>
              <div className="flex rounded-md border border-edge bg-panel p-0.5">
                {THEME_OPTIONS.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    aria-label={`${label} theme`}
                    aria-pressed={theme === value}
                    className={`flex flex-1 items-center justify-center gap-1 rounded py-1 text-[10.5px] font-medium transition-colors ${
                      theme === value
                        ? "bg-sunken text-ink shadow-sm"
                        : "text-faint hover:text-muted"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="my-1 h-px bg-edge" />

            {guest ? (
              <MenuLink
                href="/login"
                onSelect={close}
                icon={<EnterDoorIcon className="h-4 w-4" />}
              >
                Sign in
              </MenuLink>
            ) : (
              <>
                <MenuLink
                  href="/settings#profile"
                  onSelect={close}
                  icon={<SettingsIcon className="h-4 w-4" />}
                >
                  Settings
                </MenuLink>
                <MenuLink
                  href="/settings#delivery"
                  onSelect={close}
                  icon={<MailIcon className="h-4 w-4" />}
                >
                  Email delivery
                </MenuLink>
                <div className="my-1 h-px bg-edge" />
                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] font-medium text-danger transition-colors hover:bg-danger/10"
                  >
                    <LogoutIcon className="h-4 w-4" />
                    Log out
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  onSelect,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onSelect}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:bg-sunken hover:text-ink"
    >
      {icon}
      {children}
    </Link>
  );
}
