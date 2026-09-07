import React from "react";

// http(s):// or bare www. / domain.tld, up to the next whitespace.
const URL_RE =
  /(\bhttps?:\/\/[^\s<]+|\bwww\.[^\s<]+|\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|io|co|dev|app|ai|xyz|so)\b[^\s<]*)/gi;

const trimTrailing = (s: string): [string, string] => {
  const m = s.match(/[.,;:!?)\]}'"]+$/);
  if (!m) return [s, ""];
  return [s.slice(0, -m[0].length), m[0]];
};

/**
 * Render free text with URLs as clickable links. Keeps everything else as
 * plain text; safe against injection because nothing is set as HTML.
 */
export function linkify(text: string): React.ReactNode {
  if (!text) return text;
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));

    const [url, tail] = trimTrailing(raw);
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    out.push(
      <a
        key={key++}
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
      >
        {url}
      </a>,
    );
    if (tail) out.push(tail);
    last = start + raw.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
