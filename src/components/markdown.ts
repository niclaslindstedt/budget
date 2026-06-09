// Small, dependency-free markdown parser. The app renders two kinds of
// markdown through it (see `Markdown.tsx`): the one-line changelog bullets
// (title + summary + optional "Learn more" link) and the long-form feature
// docs under `docs/features/` (bundled into `src/generated/feature-docs.ts`).
// We deliberately don't pull in `react-markdown` — the subset below covers
// everything those two surfaces use, and the One Dark / One Light look wants
// every colour / radius / border to read through a theme token, which is
// easier to guarantee with our own renderer than by restyling a library's
// element map.
//
// Supported block grammar: ATX headings (`#`..`######`), paragraphs,
// unordered (`-` / `*`) and ordered (`1.`) lists, blockquotes (`>`), and
// fenced code blocks (```). Supported inline grammar: bold (`**`), italic
// (`*` / `_`), inline code (`` ` ``), and links (`[text](href)`). Nested
// blocks inside list items are out of scope — each list item is a single
// line of inline content, which is all the changelog and feature docs use.
//
// Links carrying the `feature:<slug>` scheme are intercepted by the renderer:
// instead of navigating, they call `onOpenFeature(slug)` so the changelog
// modal can swap to an in-place feature-doc view. Every other href renders as
// a normal external link.

export const FEATURE_LINK_SCHEME = "feature:";

export type Inline =
  | { type: "text"; value: string }
  | { type: "bold"; children: Inline[] }
  | { type: "italic"; children: Inline[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: number; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "blockquote"; children: Inline[] }
  | { type: "code"; value: string };

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const UL_RE = /^[-*]\s+(.*)$/;
const OL_RE = /^\d+\.\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const FENCE_RE = /^```/;

// Inline parser. Scans left to right, peeling off the first token it
// recognises and recursing into the delimited content so nesting works
// (`**bold _and italic_**`). Anything not part of a token accretes into a
// text run that's flushed when the next token (or the end) is reached.
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  let i = 0;
  const flush = () => {
    if (text) {
      out.push({ type: "text", value: text });
      text = "";
    }
  };
  while (i < src.length) {
    const c = src[i];
    // Inline code — highest precedence so `**` inside a span is literal.
    if (c === "`") {
      const end = src.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        out.push({ type: "code", value: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // Link: [label](href)
    if (c === "[") {
      const close = src.indexOf("]", i + 1);
      if (close !== -1 && src[close + 1] === "(") {
        const paren = src.indexOf(")", close + 2);
        if (paren !== -1) {
          flush();
          out.push({
            type: "link",
            href: src.slice(close + 2, paren),
            children: parseInline(src.slice(i + 1, close)),
          });
          i = paren + 1;
          continue;
        }
      }
    }
    // Bold: **text** (checked before single-* italic).
    if (c === "*" && src[i + 1] === "*") {
      const end = src.indexOf("**", i + 2);
      if (end !== -1) {
        flush();
        out.push({
          type: "bold",
          children: parseInline(src.slice(i + 2, end)),
        });
        i = end + 2;
        continue;
      }
    }
    // Italic: *text* or _text_
    if (c === "*" || c === "_") {
      const end = src.indexOf(c, i + 1);
      if (end !== -1 && end > i + 1) {
        flush();
        out.push({
          type: "italic",
          children: parseInline(src.slice(i + 1, end)),
        });
        i = end + 1;
        continue;
      }
    }
    text += c;
    i++;
  }
  flush();
  return out;
}

// Block parser. Line-based: groups consecutive lines into headings, fenced
// code, lists, blockquotes, and paragraphs, with blank lines as separators.
export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    // Fenced code block — collect until the closing fence (or EOF).
    if (FENCE_RE.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: "code", value: body.join("\n") });
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        children: parseInline(heading[2].trim()),
      });
      i++;
      continue;
    }
    // List — collect consecutive items of the same ordering.
    const ulMatch = UL_RE.exec(line);
    const olMatch = OL_RE.exec(line);
    if (ulMatch || olMatch) {
      const ordered = olMatch != null;
      const re = ordered ? OL_RE : UL_RE;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = re.exec(lines[i]);
        if (m) {
          items.push(parseInline(m[1].trim()));
          i++;
          continue;
        }
        // A bare indented continuation line folds into the last item.
        if (/^\s+\S/.test(lines[i]) && items.length) {
          const tail = parseInline(lines[i].trim());
          items[items.length - 1].push({ type: "text", value: " " }, ...tail);
          i++;
          continue;
        }
        break;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    // Blockquote — collect consecutive `>` lines, joined with spaces.
    const quote = QUOTE_RE.exec(line);
    if (quote) {
      const parts: string[] = [quote[1]];
      i++;
      while (i < lines.length) {
        const q = QUOTE_RE.exec(lines[i]);
        if (!q) break;
        parts.push(q[1]);
        i++;
      }
      blocks.push({
        type: "blockquote",
        children: parseInline(parts.join(" ").trim()),
      });
      continue;
    }
    // Paragraph — collect consecutive non-blank, non-special lines.
    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i];
      if (
        next.trim() === "" ||
        HEADING_RE.test(next) ||
        UL_RE.test(next) ||
        OL_RE.test(next) ||
        QUOTE_RE.test(next) ||
        FENCE_RE.test(next)
      ) {
        break;
      }
      para.push(next);
      i++;
    }
    blocks.push({ type: "paragraph", children: parseInline(para.join(" ")) });
  }
  return blocks;
}
