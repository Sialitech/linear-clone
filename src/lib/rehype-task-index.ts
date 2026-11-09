import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

export default function rehypeTaskIndex() {
  return (tree: Root) => {
    let index = 0;
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "input") return;
      if (node.properties?.type !== "checkbox") return;
      const current = node.properties.className;
      const classes = Array.isArray(current)
        ? current.map(String)
        : current
          ? [String(current)]
          : [];
      classes.push(`task-index-${index}`);
      node.properties.className = classes;
      index += 1;
    });
  };
}

export function taskIndexFromClassName(className: string | undefined) {
  const match = /(?:^|\s)task-index-(\d+)(?:\s|$)/.exec(className ?? "");
  if (!match?.[1]) return null;
  return Number(match[1]);
}
