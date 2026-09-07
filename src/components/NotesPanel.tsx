"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  NoteIcon,
  GripIcon,
  CloseIcon,
  ListBulletIcon,
  ListNumberIcon,
} from "./Icons";

/**
 * A rich-text scratchpad that floats over the app. Starts docked to the right
 * edge; drag the header to move it anywhere and it stays put (per browser).
 *
 * The editor is a contentEditable region driven by document.execCommand -- the
 * API is deprecated but still works everywhere and needs no dependency, which
 * is the right trade for a personal notepad. Content is stored as sanitised
 * HTML in localStorage; this is not synced client data.
 */

const HTML_KEY = "vaflow.notes.html.v1";
const LEGACY_TEXT_KEY = "vaflow.notes.text.v1";
const UI_KEY = "vaflow.notes.ui.v1";

const W = 340;
const H = 400;
const MARGIN = 16;
const DEBOUNCE = 400;

type UI = {
  open: boolean;
  /** null x => docked to the right edge; a number => free-floating. */
  x: number | null;
  y: number;
  h: number;
};

// ---------------------------------------------------------------------------
// storage + sanitising
// ---------------------------------------------------------------------------

const ALLOWED = new Set([
  "P", "DIV", "BR", "H1", "H2", "H3",
  "B", "STRONG", "I", "EM", "U", "S", "STRIKE",
  "UL", "OL", "LI", "SPAN", "A",
]);

/** Keep only allowlisted tags; drop every attribute except a plain href. */
function sanitize(html: string): string {
  if (typeof document === "undefined") return "";
  const tpl = document.createElement("template");
  tpl.innerHTML = html;

  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (!ALLOWED.has(el.tagName)) {
          el.replaceWith(...Array.from(el.childNodes));
          continue;
        }
        for (const attr of Array.from(el.attributes)) {
          const ok =
            el.tagName === "A" &&
            attr.name === "href" &&
            /^https?:\/\//i.test(attr.value);
          if (!ok) el.removeAttribute(attr.name);
        }
        if (el.tagName === "A") {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noreferrer");
        }
        walk(el);
      } else if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
      }
    }
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function loadHtml(): string {
  if (typeof window === "undefined") return "";
  try {
    const stored = window.localStorage.getItem(HTML_KEY);
    if (stored !== null) return sanitize(stored);
    // Migrate the old plain-text notepad.
    const legacy = window.localStorage.getItem(LEGACY_TEXT_KEY);
    if (legacy) {
      return legacy
        .split("\n")
        .map((line) => `<div>${esc(line) || "<br>"}</div>`)
        .join("");
    }
  } catch {
    /* ignore */
  }
  return "";
}

function readUI(): UI {
  const fallback: UI = { open: false, x: null, y: 96, h: H };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(UI_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<UI>;
    return {
      open: Boolean(p.open),
      x: typeof p.x === "number" ? p.x : null,
      y: typeof p.y === "number" ? p.y : fallback.y,
      h: typeof p.h === "number" ? p.h : fallback.h,
    };
  } catch {
    return fallback;
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

// ---------------------------------------------------------------------------
// toolbar
// ---------------------------------------------------------------------------

type ToolItem =
  | { kind: "cmd"; label: React.ReactNode; title: string; cmd: string; className?: string }
  | { kind: "block"; label: React.ReactNode; title: string; tag: string }
  | { kind: "sep" };

const TOOLS: ToolItem[] = [
  { kind: "block", label: "H1", title: "Heading 1", tag: "h1" },
  { kind: "block", label: "H2", title: "Heading 2", tag: "h2" },
  { kind: "block", label: "T", title: "Body text", tag: "p" },
  { kind: "sep" },
  { kind: "cmd", label: "B", title: "Bold (Ctrl/Cmd+B)", cmd: "bold", className: "font-bold" },
  { kind: "cmd", label: "I", title: "Italic (Ctrl/Cmd+I)", cmd: "italic", className: "italic" },
  { kind: "cmd", label: "U", title: "Underline (Ctrl/Cmd+U)", cmd: "underline", className: "underline" },
  { kind: "cmd", label: "S", title: "Strikethrough", cmd: "strikeThrough", className: "line-through" },
  { kind: "sep" },
  {
    kind: "cmd",
    label: <ListBulletIcon className="h-3.5 w-3.5" />,
    title: "Bulleted list",
    cmd: "insertUnorderedList",
  },
  {
    kind: "cmd",
    label: <ListNumberIcon className="h-3.5 w-3.5" />,
    title: "Numbered list",
    cmd: "insertOrderedList",
  },
];

// ---------------------------------------------------------------------------
// component
// ---------------------------------------------------------------------------

export default function NotesPanel() {
  const [mounted, setMounted] = useState(false);
  const [ui, setUI] = useState<UI>({ open: false, x: null, y: 96, h: H });
  const panelRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    setUI(readUI());
    setMounted(true);
  }, []);

  // Fill the editor once, after it exists. Setting innerHTML on every render
  // would fight the caret.
  useLayoutEffect(() => {
    if (mounted && ui.open && editorRef.current && !editorRef.current.dataset.filled) {
      editorRef.current.innerHTML = loadHtml();
      editorRef.current.dataset.filled = "1";
    }
  }, [mounted, ui.open]);

  const persistUI = useCallback((next: UI) => {
    setUI(next);
    try {
      window.localStorage.setItem(UI_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const saveHtml = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(
          HTML_KEY,
          sanitize(editorRef.current?.innerHTML ?? "")
        );
      } catch {
        /* ignore */
      }
    }, DEBOUNCE);
  }, []);

  const exec = useCallback(
    (cmd: string, value?: string) => {
      editorRef.current?.focus();
      document.execCommand(cmd, false, value);
      saveHtml();
    },
    [saveHtml]
  );

  // Ctrl/Cmd+J toggles the panel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        const t = e.target as HTMLElement | null;
        if (t && /^(INPUT|SELECT)$/.test(t.tagName)) return;
        e.preventDefault();
        setUI((cur) => {
          const next = { ...cur, open: !cur.open };
          try {
            window.localStorage.setItem(UI_KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep a free-floating panel on screen after a viewport resize.
  useEffect(() => {
    if (!ui.open || ui.x === null) return;
    function onResize() {
      setUI((cur) => {
        if (cur.x === null) return cur;
        const maxX = window.innerWidth - W - MARGIN;
        const maxY = window.innerHeight - 120;
        return {
          ...cur,
          x: clamp(cur.x, MARGIN, Math.max(MARGIN, maxX)),
          y: clamp(cur.y, MARGIN, Math.max(MARGIN, maxY)),
        };
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [ui.open, ui.x]);

  const startDrag = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const grabX = e.clientX - rect.left;
    const grabY = e.clientY - rect.top;

    function onMove(ev: PointerEvent) {
      ev.preventDefault();
      const maxX = window.innerWidth - W - MARGIN;
      const maxY = window.innerHeight - 120;
      setUI((cur) => ({
        ...cur,
        x: clamp(ev.clientX - grabX, MARGIN, Math.max(MARGIN, maxX)),
        y: clamp(ev.clientY - grabY, MARGIN, Math.max(MARGIN, maxY)),
      }));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      setUI((cur) => {
        try {
          window.localStorage.setItem(UI_KEY, JSON.stringify(cur));
        } catch {
          /* ignore */
        }
        return cur;
      });
    }
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = panelRef.current?.getBoundingClientRect().height ?? H;
    function onMove(ev: PointerEvent) {
      const h = clamp(startH + (ev.clientY - startY), 240, window.innerHeight - 80);
      setUI((cur) => ({ ...cur, h }));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setUI((cur) => {
        try {
          window.localStorage.setItem(UI_KEY, JSON.stringify(cur));
        } catch {
          /* ignore */
        }
        return cur;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const dockRight = useCallback(
    () => persistUI({ ...ui, x: null, y: 96 }),
    [ui, persistUI]
  );
  const close = useCallback(
    () => persistUI({ ...ui, open: false }),
    [ui, persistUI]
  );
  const open = useCallback(
    () => persistUI({ ...ui, open: true }),
    [ui, persistUI]
  );

  if (!mounted) return null;

  if (!ui.open) {
    return (
      <button
        onClick={open}
        title="Notes (Ctrl/Cmd+J)"
        aria-label="Open notes"
        className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-1.5 rounded-l-lg border border-r-0 border-edge bg-canvas px-2 py-2.5 text-[11px] font-medium text-muted shadow-sm transition-colors hover:text-ink"
      >
        <NoteIcon className="h-4 w-4" />
        <span className="[writing-mode:vertical-rl]">Notes</span>
      </button>
    );
  }

  const style: React.CSSProperties =
    ui.x === null
      ? { right: MARGIN, top: ui.y, width: W, height: ui.h }
      : { left: ui.x, top: ui.y, width: W, height: ui.h };

  return (
    <div
      ref={panelRef}
      style={style}
      className="fixed z-40 flex flex-col overflow-hidden rounded-xl border border-edge bg-canvas shadow-2xl"
    >
      {/* header / drag handle */}
      <div
        onPointerDown={startDrag}
        onDoubleClick={dockRight}
        className="flex cursor-grab items-center gap-1.5 border-b border-edge bg-panel px-2.5 py-2 active:cursor-grabbing"
      >
        <GripIcon className="h-3.5 w-3.5 text-faint" />
        <NoteIcon className="h-3.5 w-3.5 text-muted" />
        <span className="text-[12px] font-semibold text-ink">Notes</span>
        <div className="ml-auto flex items-center gap-0.5">
          {ui.x !== null && (
            <button
              onClick={dockRight}
              title="Dock to the right"
              className="rounded p-1 text-[10px] font-medium text-faint hover:bg-sunken hover:text-ink"
            >
              Dock
            </button>
          )}
          <button
            onClick={close}
            aria-label="Close notes"
            title="Close (Ctrl/Cmd+J)"
            className="rounded p-1 text-faint hover:bg-sunken hover:text-ink"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-edge bg-panel px-1.5 py-1">
        {TOOLS.map((t, i) =>
          t.kind === "sep" ? (
            <span key={i} className="mx-0.5 h-4 w-px bg-edge" />
          ) : (
            <button
              key={i}
              type="button"
              // Keep the editor selection alive while clicking the toolbar.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                t.kind === "block"
                  ? exec("formatBlock", `<${t.tag}>`)
                  : exec(t.cmd)
              }
              title={t.title}
              className={`grid h-6 min-w-6 place-items-center rounded px-1 text-[11px] font-medium text-muted hover:bg-sunken hover:text-ink ${
                t.kind === "cmd" ? t.className ?? "" : ""
              }`}
            >
              {t.label}
            </button>
          )
        )}
      </div>

      {/* editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Notes"
        data-placeholder="Jot anything. Use the bar above for headings, lists, and emphasis."
        onInput={saveHtml}
        onBlur={saveHtml}
        onPaste={(e) => {
          // Paste as plain text so foreign styles never leak in.
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          saveHtml();
        }}
        className="notes-content min-h-0 flex-1 overflow-y-auto px-3 py-2.5 text-[13px] leading-relaxed text-ink outline-none"
      />

      {/* resize handle */}
      <div
        onPointerDown={startResize}
        className="flex h-3 cursor-ns-resize items-center justify-center border-t border-edge bg-panel"
      >
        <span className="h-[3px] w-8 rounded-full bg-edge" />
      </div>
    </div>
  );
}
