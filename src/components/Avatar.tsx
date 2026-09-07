"use client";

/**
 * The user's avatar: an uploaded image, or their initials on the brand fill.
 *
 * An animated GIF plays by default. When `animate` is false a GIF is frozen to
 * its first frame -- drawn once to a canvas and shown as a still. If the draw
 * fails (a cross-origin taint, no 2D context), it falls back to the live GIF
 * rather than showing nothing.
 */

import { useEffect, useRef, useState } from "react";

const isGif = (url: string) => /\.gif(\?|$)/i.test(url);

export default function Avatar({
  src,
  initials,
  className = "",
  animate = true,
}: {
  src: string | null;
  initials: string;
  /** Extra classes for the outer circle (size, text size, ...). */
  className?: string;
  animate?: boolean;
}) {
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand font-semibold text-white ${className}`}
    >
      {src ? (
        isGif(src) && !animate ? (
          <FrozenGif src={src} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        )
      ) : (
        initials
      )}
    </span>
  );
}

function FrozenGif({ src }: { src: string }) {
  const [still, setStill] = useState<string | null>(null);
  const failed = useRef(false);

  useEffect(() => {
    setStill(null);
    failed.current = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth || 96;
        c.height = img.naturalHeight || 96;
        const ctx = c.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(img, 0, 0);
        setStill(c.toDataURL("image/png"));
      } catch {
        failed.current = true;
        setStill(null);
      }
    };
    img.onerror = () => {
      failed.current = true;
    };
    img.src = src;
  }, [src]);

  // Until the still is ready (or if freezing failed) show the live image --
  // the GIF animating briefly is a better failure than a blank circle.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={still ?? src}
      alt=""
      className="h-full w-full object-cover"
    />
  );
}
