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
