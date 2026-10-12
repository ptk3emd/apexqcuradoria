// Splits free text into plain and link segments, so a question's references
// can render their addresses as links without dangerouslySetInnerHTML.
//
// Only http(s) addresses (and bare "www." ones, which get https://) become
// links: anything else — javascript:, data:, mailto: — stays plain text.
// Trailing punctuation that closes a sentence or a parenthesis is left out of
// the link ("Ver https://x.org/a." links https://x.org/a).

export type LinkSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string };

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}»”’]+$/;

function trimTrailing(candidate: string): string {
  let url = candidate.replace(TRAILING_PUNCTUATION, '');
  // Keep a closing parenthesis that belongs to the address itself, as in
  // https://en.wikipedia.org/wiki/Sepsis_(disease).
  const opens = (url.match(/\(/g) ?? []).length;
  const closes = (url.match(/\)/g) ?? []).length;
  const stripped = candidate.slice(url.length);
  if (opens > closes && stripped.startsWith(')')) url += ')';
  return url;
}

function toHref(url: string): string | null {
  const href = /^www\./i.test(url) ? `https://${url}` : url;
  try {
    const parsed = new URL(href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function splitLinks(text: string | null | undefined): LinkSegment[] {
  if (!text) return [];
  const segments: LinkSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const url = trimTrailing(match[0]);
    const href = url ? toHref(url) : null;
    if (!href) continue;

    if (start > cursor) segments.push({ type: 'text', value: text.slice(cursor, start) });
    segments.push({ type: 'link', value: url, href });
    cursor = start + url.length;
  }

  if (cursor < text.length) segments.push({ type: 'text', value: text.slice(cursor) });
  // Merge adjacent text runs left by skipped matches.
  return segments.reduce<LinkSegment[]>((out, seg) => {
    const last = out[out.length - 1];
    if (seg.type === 'text' && last?.type === 'text') last.value += seg.value;
    else out.push({ ...seg });
    return out;
  }, []);
}
