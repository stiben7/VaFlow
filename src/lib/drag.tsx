"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Block } from "./types";
import { clamp, snap } from "./date";

/**
 * Pointer-event drag engine.
 *
 * Written by hand rather than pulled from a library for one reason: a time
 * grid needs *continuous* position, not "which droppable am I over". Dropping
 * at 9:15 vs 9:00 is the difference between a calendar and a Trello board, and
 * a droppable-per-cell approach either loses that precision or needs hundreds
 * of drop zones. Pointer events give the exact coordinate for free, and one
 * code path covers mouse, trackpad, pen and touch.
 *
 * The authoritative gesture data lives in refs, not React state. React batches
 * updates from native listeners, so the state produced by the final
 * `pointermove` is frequently still uncommitted when `pointerup` runs -- a
 * commit read from state would use a stale (often null) drop position and the
 * block would silently fail to land. State here exists only to drive
 * rendering.
 */

const MIN_DURATION = 15;
const SNAP_STEP = 15;
export const DEFAULT_DURATION = 60;
/** Where a client lands when dropped on a surface with no time axis. */
export const DEFAULT_START = 9 * 60;
/** Pixels of movement before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 4;
/** Distance from a scroll edge at which the grid starts auto-scrolling. */
const AUTOSCROLL_EDGE = 56;
const AUTOSCROLL_MAX_SPEED = 14;

export type Hit = {
  /** "YYYY-MM-DD" of the column under the pointer. */
  date: string;
  /** Unsnapped minutes-from-midnight under the pointer. */
  rawMin: number;
  /**
   * "time" (default) -- vertical position picks the hour, as in day/week.
   * "day" -- the surface only resolves a date, so an existing block keeps the
   * time it already had. That is what the month grid wants: dragging an
   * account from the 4th to the 11th should not silently move it to 9am.
   */
  granularity?: "time" | "day";
};

/** The calendar registers one of these so the engine can locate the pointer. */
export type Surface = {
  hitTest: (clientX: number, clientY: number) => Hit | null;
  scrollEl: HTMLElement | null;
};

export type DragPayload =
  | { kind: "client"; clientId: string }
  | { kind: "move"; block: Block; grabOffsetMin: number }
  | { kind: "resize"; block: Block };

export type Preview = {
  date: string;
  startMin: number;
  durationMin: number;
};

export type DragState = {
  payload: DragPayload;
  pointer: { x: number; y: number };
  /** Null until the pointer is actually over the grid. */
  preview: Preview | null;
  /** False while the gesture is still within the click threshold. */
  active: boolean;
};

type DragApi = {
  drag: DragState | null;
  registerSurface: (s: Surface | null) => void;
  /** Drag a client out of the pool. `onCreate` fires if it lands on the grid. */
  startClientDrag: (
    e: React.PointerEvent,
    clientId: string,
    onCreate: (p: Preview) => void
  ) => void;
  /** Drag an existing block. `onCommit` fires with its new position. */
  startBlockMove: (
    e: React.PointerEvent,
    block: Block,
    grabOffsetMin: number,
    onCommit: (p: Preview) => void,
    onClick?: () => void
  ) => void;
  startBlockResize: (
    e: React.PointerEvent,
    block: Block,
    onCommit: (p: Preview) => void
  ) => void;
};

const DragContext = createContext<DragApi | null>(null);

export function useDrag(): DragApi {
  const ctx = useContext(DragContext);
  if (!ctx) throw new Error("useDrag must be used inside <DragProvider>.");
  return ctx;
}

export function DragProvider({ children }: { children: React.ReactNode }) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragging = drag !== null;

  const surfaceRef = useRef<Surface | null>(null);

  // --- authoritative gesture state ---
  const payloadRef = useRef<DragPayload | null>(null);
  const activeRef = useRef(false);
  const previewRef = useRef<Preview | null>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const pointerRef = useRef({ x: 0, y: 0 });
  const commitRef = useRef<((p: Preview) => void) | null>(null);
  const clickRef = useRef<(() => void) | null>(null);

  const rafRef = useRef<number | null>(null);
  const speedRef = useRef(0);

  const registerSurface = useCallback((s: Surface | null) => {
    surfaceRef.current = s;
  }, []);

  /** Turn a raw pointer position into the block geometry it implies. */
  const computePreview = useCallback(
    (payload: DragPayload, x: number, y: number): Preview | null => {
      const hit = surfaceRef.current?.hitTest(x, y);
      if (!hit) return null;

      if (hit.granularity === "day") {
        if (payload.kind === "resize") return null;
        if (payload.kind === "client") {
          return {
            date: hit.date,
            startMin: DEFAULT_START,
            durationMin: DEFAULT_DURATION,
          };
        }
        return {
          date: hit.date,
          startMin: payload.block.startMin,
          durationMin: payload.block.durationMin,
        };
      }

      if (payload.kind === "client") {
        const start = clamp(
          snap(hit.rawMin, SNAP_STEP),
          0,
          1440 - DEFAULT_DURATION
        );
        return { date: hit.date, startMin: start, durationMin: DEFAULT_DURATION };
      }

      if (payload.kind === "move") {
        const { block, grabOffsetMin } = payload;
        const start = clamp(
          snap(hit.rawMin - grabOffsetMin, SNAP_STEP),
          0,
          1440 - block.durationMin
        );
        return { date: hit.date, startMin: start, durationMin: block.durationMin };
      }

      // resize: the bottom edge follows the pointer, the top stays put, and the
      // day column is ignored so a sloppy sideways drag cannot move the block.
      const { block } = payload;
      const end = clamp(
        snap(hit.rawMin, SNAP_STEP),
        block.startMin + MIN_DURATION,
        1440
      );
      return {
        date: block.date,
        startMin: block.startMin,
        durationMin: end - block.startMin,
      };
    },
    []
  );

  const stopAutoscroll = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    speedRef.current = 0;
  }, []);

  /** Publish the current refs into React state so the UI redraws. */
  const publish = useCallback(() => {
    const payload = payloadRef.current;
    if (!payload) return;
    setDrag({
      payload,
      pointer: { ...pointerRef.current },
      preview: previewRef.current,
      active: activeRef.current,
    });
  }, []);

  const tickAutoscroll = useCallback(() => {
    const el = surfaceRef.current?.scrollEl;
    const speed = speedRef.current;
    if (!el || speed === 0 || !payloadRef.current) {
      rafRef.current = null;
      return;
    }
    const before = el.scrollTop;
    el.scrollTop += speed;
    // Scrolling moves the grid under a stationary pointer, so the drop target
    // has to be recomputed even though no pointermove fired.
    if (el.scrollTop !== before) {
      previewRef.current = computePreview(
        payloadRef.current,
        pointerRef.current.x,
        pointerRef.current.y
      );
      publish();
    }
    rafRef.current = requestAnimationFrame(tickAutoscroll);
  }, [computePreview, publish]);

  const updateAutoscroll = useCallback(
    (clientY: number) => {
      const el = surfaceRef.current?.scrollEl;
      if (!el) {
        speedRef.current = 0;
        return;
      }
      const rect = el.getBoundingClientRect();
      let speed = 0;
      if (clientY < rect.top + AUTOSCROLL_EDGE) {
        const d = (rect.top + AUTOSCROLL_EDGE - clientY) / AUTOSCROLL_EDGE;
        speed = -Math.ceil(d * AUTOSCROLL_MAX_SPEED);
      } else if (clientY > rect.bottom - AUTOSCROLL_EDGE) {
        const d = (clientY - (rect.bottom - AUTOSCROLL_EDGE)) / AUTOSCROLL_EDGE;
        speed = Math.ceil(d * AUTOSCROLL_MAX_SPEED);
      }
      speedRef.current = speed;
      if (speed !== 0 && rafRef.current === null) {
        rafRef.current = requestAnimationFrame(tickAutoscroll);
      }
      if (speed === 0) stopAutoscroll();
    },
    [tickAutoscroll, stopAutoscroll]
  );

  const reset = useCallback(() => {
    payloadRef.current = null;
    activeRef.current = false;
    previewRef.current = null;
    commitRef.current = null;
    clickRef.current = null;
    stopAutoscroll();
    setDrag(null);
  }, [stopAutoscroll]);

  const begin = useCallback(
    (
      e: React.PointerEvent,
      payload: DragPayload,
      onCommit: (p: Preview) => void,
      onClick?: () => void
    ) => {
      // Ignore right/middle button so context menus still work.
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      payloadRef.current = payload;
      activeRef.current = false;
      previewRef.current = null;
      originRef.current = { x: e.clientX, y: e.clientY };
      pointerRef.current = { x: e.clientX, y: e.clientY };
      commitRef.current = onCommit;
      clickRef.current = onClick ?? null;

      setDrag({
        payload,
        pointer: { x: e.clientX, y: e.clientY },
        preview: null,
        active: false,
      });
    },
    []
  );

  // ---- global listeners, installed once per gesture -----------------------
  useEffect(() => {
    if (!dragging) return;

    function onMove(e: PointerEvent) {
      const payload = payloadRef.current;
      if (!payload) return;

      pointerRef.current = { x: e.clientX, y: e.clientY };

      if (!activeRef.current) {
        const dx = e.clientX - originRef.current.x;
        const dy = e.clientY - originRef.current.y;
        if (Math.hypot(dx, dy) <= DRAG_THRESHOLD) return;
        activeRef.current = true;
      }

      previewRef.current = computePreview(payload, e.clientX, e.clientY);
      updateAutoscroll(e.clientY);
      publish();
    }

    function onUp() {
      const payload = payloadRef.current;
      const wasActive = activeRef.current;
      const preview = previewRef.current;
      const commit = commitRef.current;
      const click = clickRef.current;

      reset();
      if (!payload) return;

      if (!wasActive) click?.();
      else if (preview) commit?.(preview);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") reset();
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [dragging, computePreview, updateAutoscroll, publish, reset]);

  // Kill text selection and the iOS long-press menu for the duration of a drag.
  const active = drag?.active ?? false;
  const kind = drag?.payload.kind;
  useEffect(() => {
    if (!active) return;
    const { body } = document;
    const prevSelect = body.style.userSelect;
    const prevCursor = body.style.cursor;
    body.style.userSelect = "none";
    body.style.cursor = kind === "resize" ? "ns-resize" : "grabbing";
    return () => {
      body.style.userSelect = prevSelect;
      body.style.cursor = prevCursor;
    };
  }, [active, kind]);

  useEffect(() => stopAutoscroll, [stopAutoscroll]);

  const api = useMemo<DragApi>(
    () => ({
      drag,
      registerSurface,
      startClientDrag: (e, clientId, onCreate) =>
        begin(e, { kind: "client", clientId }, onCreate),
      startBlockMove: (e, block, grabOffsetMin, onCommit, onClick) =>
        begin(e, { kind: "move", block, grabOffsetMin }, onCommit, onClick),
      startBlockResize: (e, block, onCommit) =>
        begin(e, { kind: "resize", block }, onCommit),
    }),
    [drag, registerSurface, begin]
  );

  return <DragContext.Provider value={api}>{children}</DragContext.Provider>;
}
