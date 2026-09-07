/**
 * True when the keyboard event is landing somewhere the user is entering text
 * -- a form field or any `contentEditable` region (the Notes editor is a
 * contentEditable `<div>`, not a `<textarea>`, so a plain tag check misses it).
 *
 * Global single-key shortcuts must call this and bail, or letters like D / W /
 * M / T get swallowed as view-switch shortcuts while someone is typing.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true;
  // `isContentEditable` is inherited, so this is true for the editable root
  // and anything the caret sits inside.
  return el.isContentEditable === true;
}
