const MAX_URL_LENGTH = 2000;

const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);

export function webhookUrlError(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > MAX_URL_LENGTH) {
    return value ? "Webhook URL is too long" : "Enter a webhook URL";
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter a valid webhook URL";
  }
  if (url.protocol !== "https:") return "Webhook URL must use https";
  if (url.username || url.password) return "Webhook URL cannot include a username or password";
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host || host === "." ) return "Webhook URL needs a host";
  if (
    BLOCKED_HOSTS.has(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return "Webhook URL cannot target a local host";
  }
  if (isBlockedAddress(host)) return "Webhook URL cannot target a private address";
  return null;
}

export function assertWebhookUrl(raw: string) {
  const error = webhookUrlError(raw);
  if (error) throw new Error(error);
  return raw.trim();
}

function isBlockedAddress(host: string): boolean {
  if (/^\d+$/.test(host)) return true;
  if (looksLikeIpv4(host)) {
    const v4 = parseIPv4(host);
    return !v4 || isBlockedV4(v4);
  }
  if (!host.includes(":")) return false;
  const v6 = parseIPv6(host);
  if (!v6) return true;
  return isBlockedV6(v6);
}

function looksLikeIpv4(host: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function parseIPv4(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return [octets[0]!, octets[1]!, octets[2]!, octets[3]!];
}

function isBlockedV4(octets: [number, number, number, number]) {
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function parseIPv6(host: string): Uint8Array | null {
  const expanded = expandIpv4Tail(host);
  const halves = expanded.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8) return null;
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 8; index += 1) {
    const group = groups[index]!;
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const value = Number.parseInt(group, 16);
    bytes[index * 2] = value >> 8;
    bytes[index * 2 + 1] = value & 0xff;
  }
  return bytes;
}

function expandIpv4Tail(host: string) {
  if (!host.includes(".")) return host;
  const lastColon = host.lastIndexOf(":");
  if (lastColon === -1) return host;
  const tail = parseIPv4(host.slice(lastColon + 1));
  if (!tail) return host;
  const hi = ((tail[0] << 8) | tail[1]).toString(16);
  const lo = ((tail[2] << 8) | tail[3]).toString(16);
  return `${host.slice(0, lastColon)}:${hi}:${lo}`;
}

function isBlockedV6(bytes: Uint8Array) {
  if (bytes.every((byte) => byte === 0)) return true;
  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) return true;
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) return true;
  if ((bytes[0]! & 0xfe) === 0xfc) return true;
  const mapped =
    bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (!mapped) return false;
  return isBlockedV4([bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!]);
}
