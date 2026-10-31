const GITHUB_APP_NAME_MAX = 34;
export const GITHUB_OAUTH_STATE_COOKIE = "gh_oauth_state";

export function parsePullRequestUrl(url: string) {
  try {
    const parsed = new URL(url.trim());
    if (parsed.hostname !== "github.com" && parsed.hostname !== "www.github.com") {
      return null;
    }
    const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/);
    if (!match) return null;
    const owner = match[1];
    const repo = match[2];
    const number = Number(match[3]);
    if (!owner || !repo || !Number.isFinite(number)) return null;
    return {
      owner,
      repo,
      number,
      url: `https://github.com/${owner}/${repo}/pull/${number}`,
    };
  } catch {
    return null;
  }
}

/** Accept only an origin we are willing to send the browser back to. */
export function normalizeReturnOrigin(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  const local =
    url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !local) return null;
  return url.origin;
}

export function githubAppDisplayName(workspaceLabel: string, nonce: string) {
  const suffix = (nonce.replace(/[^a-z0-9]/gi, "").slice(0, 4) || "app").toLowerCase();
  const words = workspaceLabel.replace(/[^A-Za-z0-9]+/g, " ").trim();
  const base = words.length > 0 ? words : "Issues";
  const maxBase = GITHUB_APP_NAME_MAX - suffix.length - 1;
  const trimmed = base.slice(0, Math.max(1, maxBase)).trim();
  const name = `${trimmed.length > 0 ? trimmed : "Issues"} ${suffix}`;
  return name.slice(0, GITHUB_APP_NAME_MAX);
}

export type GithubManifest = {
  name: string;
  url: string;
  redirect_url: string;
  callback_urls: [string];
  description: string;
  public: boolean;
  request_oauth_on_install: boolean;
  setup_url: string;
  setup_on_update: boolean;
  default_permissions: {
    metadata: "read";
    pull_requests: "read";
  };
  hook_attributes: {
    url: string;
    active: false;
  };
};

export function buildGithubManifest(args: {
  name: string;
  homepage: string;
  convexSite: string;
}): GithubManifest {
  const site = args.convexSite.replace(/\/$/, "");
  return {
    name: args.name,
    url: args.homepage,
    redirect_url: `${site}/github/register/callback`,
    callback_urls: [`${site}/github/oauth/callback`],
    description: "Reads pull request status for linked issues.",
    public: true,
    request_oauth_on_install: false,
    setup_url: `${site}/github/setup`,
    setup_on_update: true,
    default_permissions: {
      metadata: "read",
      pull_requests: "read",
    },
    hook_attributes: {
      url: `${site}/github/webhook`,
      active: false,
    },
  };
}

export function githubAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  mode: "oauth_app" | "github_app";
}) {
  const params = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    state: args.state,
    scope: args.mode === "oauth_app" ? "repo read:user" : "offline_access",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export function githubInstallUrl(slug: string, state: string) {
  const params = new URLSearchParams({ state });
  return `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?${params.toString()}`;
}

export function githubOAuthStartUrl(convexSite: string, state: string) {
  const site = convexSite.replace(/\/$/, "");
  const params = new URLSearchParams({ state });
  return `${site}/github/oauth/start?${params.toString()}`;
}

const GITHUB_STATUS = new Set(["connected", "expired", "missing", "error", "denied"]);

export function settingsLocation(origin: string | null | undefined, status: string) {
  if (!origin) return null;
  const safe = normalizeReturnOrigin(origin);
  if (!safe) return null;
  const destination = new URL("/settings", safe);
  destination.searchParams.set("github", GITHUB_STATUS.has(status) ? status : "error");
  return destination.toString();
}

export function readCookie(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export function oauthStateCookie(state: string) {
  return `${GITHUB_OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; HttpOnly; Secure; SameSite=Lax; Path=/github; Max-Age=1800`;
}

export function clearOAuthStateCookie() {
  return `${GITHUB_OAUTH_STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/github; Max-Age=0`;
}

export function parseGithubTokenBody(body: unknown, now: number) {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const accessToken = record.access_token;
  if (typeof accessToken !== "string" || accessToken.length === 0 || accessToken.length > 2000) {
    return null;
  }
  const refreshToken =
    typeof record.refresh_token === "string" &&
    record.refresh_token.length > 0 &&
    record.refresh_token.length <= 2000
      ? record.refresh_token
      : null;
  const expiresIn =
    typeof record.expires_in === "number" && Number.isFinite(record.expires_in) && record.expires_in > 0
      ? record.expires_in
      : null;
  return {
    accessToken,
    refreshToken,
    expiresAt: expiresIn === null ? null : now + expiresIn * 1000,
  };
}

export function parseGithubUser(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.id !== "number" && typeof record.id !== "string") return null;
  const id = String(record.id);
  if (!/^\d+$/.test(id) || id.length > 30) return null;
  const login =
    typeof record.login === "string" && /^[A-Za-z0-9-]{1,39}$/.test(record.login) ? record.login : null;
  return { id, login };
}

export function parseManifestApp(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.id !== "number" || !Number.isFinite(record.id)) return null;
  const slug = bounded(record.slug, 100);
  const name = bounded(record.name, 100);
  const clientId = bounded(record.client_id, 200);
  const clientSecret = bounded(record.client_secret, 200);
  const privateKey = bounded(record.pem, 20000);
  if (!slug || !name || !clientId || !clientSecret || !privateKey) return null;
  const webhookSecret = bounded(record.webhook_secret, 200);
  return {
    appId: record.id,
    slug,
    name,
    clientId,
    clientSecret,
    privateKey,
    webhookSecret,
  };
}

function bounded(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}
