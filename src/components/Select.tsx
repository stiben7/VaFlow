"use client";

/**
 * A native <select> wearing the app's input styling: the browser's raw
 * dropdown arrow is hidden (`appearance-none`) and replaced with the app's
 * own ChevronDownIcon, inset from the border so it never crowds the edge.
 */

import type { SelectHTMLAttributes } from "react";
import { ChevronDownIcon } from "./Icons";

export default function Select({
  className = "",
  fullWidth = false,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { fullWidth?: boolean }) {
  return (
    <div className={`relative ${fullWidth ? "flex w-full" : "inline-flex"}`}>
      <select
        {...props}
        className={`${
          fullWidth ? "w-full" : ""
        } appearance-none rounded-md border border-edge bg-canvas py-1.5 pl-2.5 pr-8 text-[12.5px] text-ink outline-none transition-colors hover:border-faint focus:border-brand focus:ring-2 focus:ring-brand/15 ${className}`}
      />
      <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
    </div>
  );
}
