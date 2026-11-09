const DATA_IMAGE = /!\[([^\]]*)\]\((data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+))\)/gi;

export const MCP_IMAGE_BYTES = 1_000_000;

export type IncomingImage = {
  name: string;
  contentType: string;
  data: string;
};

export function decodeBase64(data: string) {
  const cleaned = data.replace(/\s/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function materializeImages(
  text: string,
  extra: IncomingImage[],
  store: (file: { name: string; contentType: string; bytes: Uint8Array }) => Promise<string>,
) {
  let next = text;
  const matches = [...text.matchAll(new RegExp(DATA_IMAGE.source, "gi"))];
  for (const match of matches) {
    const alt = match[1] || "image";
    const subtype = match[3] || "png";
    const data = match[4] || "";
    const bytes = decodeBase64(data);
    if (bytes.byteLength > MCP_IMAGE_BYTES) throw new Error("Images must be 1 MB or smaller");
    const url = await store({ name: alt, contentType: `image/${subtype}`, bytes });
    next = next.replace(match[0], `![${alt}](${url})`);
  }
  for (const image of extra) {
    if (!image.contentType.startsWith("image/")) throw new Error("Only images can be attached");
    const bytes = decodeBase64(image.data);
    if (bytes.byteLength === 0 || bytes.byteLength > MCP_IMAGE_BYTES) {
      throw new Error("Images must be 1 MB or smaller");
    }
    const url = await store({ name: image.name, contentType: image.contentType, bytes });
    const alt = image.name.replace(/[\[\]]/g, "").slice(0, 80) || "image";
    const line = `![${alt}](${url})`;
    next = next.trim() ? `${next.trim()}\n\n${line}` : line;
  }
  return next;
}
