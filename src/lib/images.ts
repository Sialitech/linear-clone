export const STORAGE_IMAGE = /!\[([^\]]*)\]\((?:storage:|https?:\/\/[^)\s]*\/api\/storage\/)([a-z0-9]+)\)/gi;

export type TextPart =
  | { type: "text"; value: string }
  | { type: "image"; alt: string; storageId: string };

export function splitStorageImages(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const pattern = new RegExp(STORAGE_IMAGE.source, "gi");
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ type: "text", value: text.slice(last, index) });
    parts.push({ type: "image", alt: match[1] ?? "", storageId: match[2] ?? "" });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  if (parts.length === 0) parts.push({ type: "text", value: text });
  return parts;
}

export function storageIdsInText(text: string) {
  return splitStorageImages(text)
    .filter((part) => part.type === "image")
    .map((part) => part.storageId);
}

export function imageMarkdown(fileName: string, url: string) {
  const alt = fileName.replace(/[\[\]]/g, "").slice(0, 80) || "image";
  return `![${alt}](${url})`;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function assertImageFile(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Only images can be attached");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Images must be 5 MB or smaller");
}
