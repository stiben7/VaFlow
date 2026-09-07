"use client";

/**
 * A small styled hover tip, in the app's own surface tokens rather than the
 * browser's native `title` bubble. Wrap a single interactive child; the tip
 * fades in on hover after a short delay.
 *
 * Hover only -- not focus. A focus trigger sticks the tip open after a mouse
 * click (the button keeps focus), which reads as a bug. The child's
 * `aria-label` plus `aria-describedby` here still name it for assistive tech.
 *
 * Remove the child's `title` attribute when you wrap it here, or the native
 * bubble shows on top of this one.
 */

import { useId } from "react";

type Side = "top" | "bottom" | "left" | "right";

const POS: Record<Side, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
  left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
  right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
};

export default function Tooltip({
  label,
  side = "top",
  children,
}: {
  label: string;
  side?: Side;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <span className="group/tt relative inline-flex" aria-describedby={id}>
      {children}
      <span
        role="tooltip"
        id={id}
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-edge bg-canvas px-1.5 py-1 text-[11px] font-medium text-ink opacity-0 shadow-md transition-opacity delay-0 duration-150 group-hover/tt:opacity-100 group-hover/tt:delay-500 motion-reduce:transition-none ${POS[side]}`}
      >
        {label}
      </span>
    </span>
  );
}
