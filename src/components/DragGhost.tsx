"use client";

import { useStore } from "@/lib/store";
import { useDrag } from "@/lib/drag";
import { accentFor } from "@/lib/colors";

/**
 * The card that follows the cursor while a client is dragged out of the pool.
 *
 * It hides itself the moment the pointer is over the grid, because at that
 * point the in-grid preview is the better signal -- showing both reads as two
 * copies of the same thing being dragged.
 */
export default function DragGhost() {
  const { drag } = useDrag();
  const { clientById } = useStore();

  if (!drag?.active || drag.payload.kind !== "client" || drag.preview) return null;

  const client = clientById(drag.payload.clientId);
  if (!client) return null;
  const accent = accentFor(client);

  return (
    <div
      className={`pointer-events-none fixed z-[60] max-w-[220px] -translate-y-1/2 translate-x-3 overflow-hidden rounded-md border pl-2.5 pr-2.5 py-1.5 shadow-xl ${accent.chip}`}
      style={{ ...accent.style, left: drag.pointer.x, top: drag.pointer.y }}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${accent.bar}`} />
      <div className={`truncate text-[12px] font-semibold ${accent.text}`}>
        {client.name}
      </div>
    </div>
  );
}
