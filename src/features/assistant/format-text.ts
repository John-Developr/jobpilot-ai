/**
 * Tiny, safe formatter for assistant answers: paragraphs, "- " / "1. " lists and **bold**.
 * Produces plain data that components render as React elements (never HTML strings).
 */

export type TextBlock =
  | { type: "paragraph"; lines: string[] }
  | { type: "bullets"; items: string[] }
  | { type: "numbers"; items: string[] };

export type InlineSegment = { text: string; bold: boolean };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;

export function parseBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const last = blocks.at(-1);
    const bullet = BULLET.exec(line);
    const number = NUMBER.exec(line);
    if (bullet?.[1] !== undefined) {
      if (last?.type === "bullets") last.items.push(bullet[1]);
      else blocks.push({ type: "bullets", items: [bullet[1]] });
    } else if (number?.[1] !== undefined) {
      if (last?.type === "numbers") last.items.push(number[1]);
      else blocks.push({ type: "numbers", items: [number[1]] });
    } else if (!line.trim()) {
      // A blank line ends the current block; the next line starts a new one.
      if (last && !(last.type === "paragraph" && last.lines.length === 0)) blocks.push({ type: "paragraph", lines: [] });
    } else if (last?.type === "paragraph") {
      last.lines.push(line.replace(/^#+\s+/, ""));
    } else {
      blocks.push({ type: "paragraph", lines: [line.replace(/^#+\s+/, "")] });
    }
  }
  return blocks.filter((block) => (block.type === "paragraph" ? block.lines.length > 0 : block.items.length > 0));
}

export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > index) segments.push({ text: text.slice(index, match.index), bold: false });
    segments.push({ text: match[1] ?? "", bold: true });
    index = match.index + match[0].length;
  }
  if (index < text.length) segments.push({ text: text.slice(index), bold: false });
  return segments;
}
