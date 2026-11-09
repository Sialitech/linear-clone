import type { Link, Parent, PhrasingContent, Root } from "mdast";
import { visit } from "unist-util-visit";

export type EditResult = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

export type MentionMark = {
  userId: string;
  token: string;
};

export type MentionPiece =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; userId: string };

const SAFE_PROTOCOL = /^(https?|ircs?|mailto|xmpp)$/i;
const TASK_LINE = /^(\s*(?:>\s*)*(?:[-*+]|\d+\.)\s+)\[([ xX])\]/;
const FENCE = /^ {0,3}(```+|~~~+)/;

const MARKDOWN_HINT =
  /(^|\n)\s{0,3}(#{1,6}\s|```|~~~|[-*+]\s|\d+\.\s|>\s)|\[[^\]]+\]\([^)\s]+\)|!\[[^\]]*\]\([^)\s]+\)|\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`/;

/** True when pasted plain text is worth parsing as Markdown instead of literal text. */
export function looksLikeMarkdown(text: string) {
  return text.length > 1 && MARKDOWN_HINT.test(text);
}

/**
 * Parse a paste as Markdown when the plain text looks like Markdown.
 * Browsers wrap plain text in paragraphs; that wrapper is not rich formatting.
 * Real formatting (bold, links, lists, code) is left to the editor's HTML paste.
 */
export function shouldParsePasteAsMarkdown(text: string, html: string) {
  if (!looksLikeMarkdown(text)) return false;
  if (!html) return true;
  return !/<(?:strong|em|b|i|a|ul|ol|table|h[1-6]|li|code|pre|blockquote)\b/i.test(html);
}

/** Drop unsafe link targets before Markdown is stored. */
export function sanitizeStoredMarkdown(markdown: string) {
  let result = "";
  for (let i = 0; i < markdown.length; i += 1) {
    if (markdown[i] !== "[") {
      result += markdown[i];
      continue;
    }
    const labelEnd = markdown.indexOf("](", i + 1);
    const label = markdown.slice(i + 1, labelEnd);
    if (labelEnd === -1 || label.includes("\n") || label.includes("[")) {
      result += markdown[i];
      continue;
    }
    const urlStart = labelEnd + 2;
    let depth = 1;
    let end = urlStart;
    for (; end < markdown.length; end += 1) {
      const char = markdown[end];
      if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) {
      result += markdown[i];
      continue;
    }
    const raw = markdown.slice(urlStart, end).trim();
    const dest = raw.startsWith("<") && raw.includes(">") ? raw.slice(1, raw.indexOf(">")) : (raw.split(/\s+/)[0] ?? raw);
    const safe = safeMarkdownUrl(dest);
    if (!safe) result += label;
    else if (safe === dest) result += markdown.slice(i, end + 1);
    else result += `[${label}](${safe})`;
    i = end;
  }
  return result.replace(/<(?:javascript|data|vbscript):[^>]*>/gi, "");
}

/** Slash command typed at the start of a block or after whitespace. */
export function findSlashQuery(text: string, caret: number) {
  const before = text.slice(0, Math.max(0, caret));
  const match = before.match(/(^|\s)\/([^\s/]*)$/);
  if (!match) return null;
  const query = match[2] ?? "";
  const start = before.length - query.length - 1;
  return { query, start, end: before.length };
}

/** Short label for a long URL. The full address stays on the link itself. */
export function shortenUrl(href: string) {
  if (href.startsWith("mailto:")) return clipEnd(href.slice("mailto:".length).split("?")[0] ?? href, 32);
  if (href.startsWith("/") && !href.startsWith("//")) return shortenPath(href);
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return clipMiddle(href, 42);
  }
  if (url.protocol === "mailto:") return clipEnd(url.pathname, 32);
  const host = url.host.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean).map(decodePart);
  const query = url.search || url.hash ? "…" : "";
  if (parts.length === 0) return host + query;
  const tail = clipTail(parts[parts.length - 1] ?? "");
  if (parts.length === 1) return `${host}/${tail}${query}`;
  return `${host}/…/${tail}${query}`;
}

/**
 * Label to show when the link text is the URL itself.
 * Author-written labels such as `[docs](url)` stay as written.
 */
export function shortenedAutolinkLabel(href: string, text: string) {
  const compact = text.replace(/\s+/g, "");
  if (!compact || !sameUrl(href, compact)) return null;
  const short = shortenUrl(href);
  return short === compact ? null : short;
}

function sameUrl(href: string, text: string) {
  const bare = (value: string) => value.replace(/\/$/, "");
  const withoutProtocol = href.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const mail = href.startsWith("mailto:") ? href.slice("mailto:".length).split("?")[0] : "";
  const forms = [href, bare(href), withoutProtocol, bare(withoutProtocol), mail].filter(Boolean);
  return forms.includes(text) || forms.includes(bare(text));
}

function shortenPath(href: string) {
  const hash = href.search(/[?#]/);
  const path = hash === -1 ? href : href.slice(0, hash);
  const extra = hash === -1 ? "" : "…";
  const parts = path.split("/").filter(Boolean).map(decodePart);
  if (parts.length <= 2 && href.length <= 48) return href;
  const head = parts[0] ? `/${parts[0]}` : "";
  const tail = clipTail(parts[parts.length - 1] ?? "");
  return `${head}/…/${tail}${extra}`;
}

function clipTail(value: string) {
  return value.length > 18 ? value.slice(0, 8) : value;
}

function clipEnd(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function clipMiddle(value: string, max: number) {
  if (value.length <= max) return value;
  const tail = Math.floor((max - 1) / 2);
  const head = max - 1 - tail;
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

function decodePart(part: string) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

export function safeMarkdownUrl(url: string) {
  if (url.startsWith("mention:")) return url;
  if (url.startsWith("//")) return "";
  const colon = url.indexOf(":");
  const slash = url.indexOf("/");
  const question = url.indexOf("?");
  const hash = url.indexOf("#");
  const hasProtocol =
    colon !== -1 &&
    (slash === -1 || colon < slash) &&
    (question === -1 || colon < question) &&
    (hash === -1 || colon < hash);
  if (!hasProtocol) return url;
  if (SAFE_PROTOCOL.test(url.slice(0, colon))) return url;
  return "";
}

export function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after = before,
): EditResult {
  const selected = value.slice(start, end);
  const outside =
    start >= before.length &&
    value.slice(start - before.length, start) === before &&
    value.slice(end, end + after.length) === after;
  if (outside) {
    const next = value.slice(0, start - before.length) + selected + value.slice(end + after.length);
    const selectionStart = start - before.length;
    return { value: next, selectionStart, selectionEnd: selectionStart + selected.length };
  }
  const inside =
    selected.startsWith(before) &&
    selected.endsWith(after) &&
    selected.length >= before.length + after.length;
  if (inside) {
    const inner = selected.slice(before.length, selected.length - after.length);
    return {
      value: value.slice(0, start) + inner + value.slice(end),
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  if (start === end) {
    const caret = start + before.length;
    return { value: next, selectionStart: caret, selectionEnd: caret };
  }
  return {
    value: next,
    selectionStart: start + before.length,
    selectionEnd: end + before.length,
  };
}

export function togglePrefix(value: string, start: number, end: number, prefix: string): EditResult {
  const bounds = lineBounds(value, start, end);
  const all = bounds.lines.every((line) => line.trim() === "" || line.startsWith(prefix));
  const lines = bounds.lines.map((line) => {
    if (line.trim() === "") return line;
    if (all) return line.slice(prefix.length);
    if (line.startsWith(prefix)) return line;
    return prefix + line;
  });
  return replaceLines(value, bounds.lineStart, bounds.lineEnd, lines);
}

export function toggleOrderedList(value: string, start: number, end: number): EditResult {
  const bounds = lineBounds(value, start, end);
  const ordered = /^\d+\.\s+/;
  const all = bounds.lines.every((line) => line.trim() === "" || ordered.test(line));
  let number = 1;
  const lines = bounds.lines.map((line) => {
    if (line.trim() === "") return line;
    const text = line.replace(ordered, "");
    if (all) return text;
    return `${number++}. ${text}`;
  });
  return replaceLines(value, bounds.lineStart, bounds.lineEnd, lines);
}

export function toggleTaskList(value: string, start: number, end: number): EditResult {
  const bounds = lineBounds(value, start, end);
  const task = /^(\s*)(?:[-*+]|\d+\.)\s+\[[ xX]\]\s+/;
  const list = /^(\s*)([-*+]|\d+\.)\s+/;
  const all = bounds.lines.every((line) => line.trim() === "" || task.test(line));
  const lines = bounds.lines.map((line) => {
    if (line.trim() === "") return line;
    if (all) return line.replace(task, "");
    if (task.test(line)) return line;
    if (list.test(line)) return line.replace(list, "$1$2 [ ] ");
    return `- [ ] ${line}`;
  });
  return replaceLines(value, bounds.lineStart, bounds.lineEnd, lines);
}

export function insertLink(value: string, start: number, end: number): EditResult {
  const selected = value.slice(start, end);
  if (/^https?:\/\/\S+$/.test(selected)) {
    const insert = `[](${selected})`;
    const caret = start + 1;
    return {
      value: value.slice(0, start) + insert + value.slice(end),
      selectionStart: caret,
      selectionEnd: caret,
    };
  }
  const label = selected || "text";
  const insert = `[${label}](url)`;
  const urlStart = start + label.length + 3;
  return {
    value: value.slice(0, start) + insert + value.slice(end),
    selectionStart: urlStart,
    selectionEnd: urlStart + 3,
  };
}

export function insertCodeBlock(value: string, start: number, end: number): EditResult {
  const selected = value.slice(start, end);
  const insert = "```\n" + selected + "\n```";
  const selectionStart = start + 4;
  return {
    value: value.slice(0, start) + insert + value.slice(end),
    selectionStart,
    selectionEnd: selectionStart + selected.length,
  };
}

export function insertBlock(value: string, start: number, end: number, block: string): EditResult {
  let pad = "";
  if (start > 0 && !value.slice(0, start).endsWith("\n\n")) {
    pad = value[start - 1] === "\n" ? "\n" : "\n\n";
  }
  const suffix = end < value.length && value[end] !== "\n" ? "\n" : "";
  const insert = pad + block + suffix;
  const selectionStart = start + pad.length;
  return {
    value: value.slice(0, start) + insert + value.slice(end),
    selectionStart,
    selectionEnd: selectionStart + block.length,
  };
}

/** Flip the nth rendered task checkbox. Fenced code is ignored, matching the preview. */
export function toggleTaskAt(source: string, index: number) {
  if (!Number.isInteger(index) || index < 0) return source;
  const lines = source.split("\n");
  let fence: "`" | "~" | null = null;
  let seen = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]?.startsWith("~") ? "~" : "`";
      fence = fence === marker ? null : fence ? fence : marker;
      continue;
    }
    if (fence) continue;
    const match = TASK_LINE.exec(line);
    if (!match) continue;
    if (seen === index) {
      const mark = match[2]?.toLowerCase() === "x" ? " " : "x";
      lines[i] = `${match[1]}[${mark}]${line.slice(match[0].length)}`;
      return lines.join("\n");
    }
    seen += 1;
  }
  return source;
}

export function splitMentions(value: string, mentions: MentionMark[]): MentionPiece[] {
  const tokens = mentions
    .filter((item) => item.token.startsWith("@") && item.token.length > 1)
    .sort((a, b) => b.token.length - a.token.length);
  if (tokens.length === 0 || !value.includes("@")) return [{ type: "text", value }];
  const pieces: MentionPiece[] = [];
  let rest = value;
  while (rest.length > 0) {
    let earliest = -1;
    let hit: MentionMark | null = null;
    for (const mention of tokens) {
      let from = 0;
      while (from < rest.length) {
        const index = rest.indexOf(mention.token, from);
        if (index === -1) break;
        const before = index === 0 ? undefined : rest[index - 1];
        const after = rest[index + mention.token.length];
        if (isMentionEdge(before, "before") && isMentionEdge(after, "after")) {
          if (
            earliest === -1 ||
            index < earliest ||
            (index === earliest && hit !== null && mention.token.length > hit.token.length)
          ) {
            earliest = index;
            hit = mention;
          }
          break;
        }
        from = index + mention.token.length;
      }
    }
    if (earliest === -1 || !hit) {
      pieces.push({ type: "text", value: rest });
      break;
    }
    if (earliest > 0) pieces.push({ type: "text", value: rest.slice(0, earliest) });
    pieces.push({ type: "mention", value: hit.token, userId: hit.userId });
    rest = rest.slice(earliest + hit.token.length);
  }
  return pieces;
}

function isMentionEdge(char: string | undefined, side: "before" | "after") {
  if (!char) return true;
  if (side === "before") return /[\s([{]/.test(char);
  return /[\s.,!?;:)\]}'"]/.test(char);
}

function lineBounds(value: string, start: number, end: number) {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const cursor = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const nextBreak = value.indexOf("\n", cursor);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  return { lineStart, lineEnd, lines: value.slice(lineStart, lineEnd).split("\n") };
}

export function remarkMentions(mentions: MentionMark[] = []) {
  return (tree: Root) => {
    if (mentions.length === 0) return;
    visit(tree, "text", (node, index, parent) => {
      if (!parent || index === undefined) return;
      if (parent.type === "link" || parent.type === "linkReference") return;
      const pieces = splitMentions(node.value, mentions);
      if (pieces.length === 1 && pieces[0]?.type === "text") return;
      const next: PhrasingContent[] = pieces.map((piece) => {
        if (piece.type === "text") return { type: "text", value: piece.value };
        const link: Link = {
          type: "link",
          url: `mention:${piece.userId}`,
          children: [{ type: "text", value: piece.value }],
        };
        return link;
      });
      const children = parent.children as Parent["children"];
      children.splice(index, 1, ...next);
      return index + next.length;
    });
  };
}

function replaceLines(value: string, lineStart: number, lineEnd: number, lines: string[]): EditResult {
  const block = lines.join("\n");
  return {
    value: value.slice(0, lineStart) + block + value.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + block.length,
  };
}
