const PR_URL_RE =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)\/?$/i;

const REPO_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

export function isGitHubOAuthConfigured() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  return Boolean(clientId && clientSecret);
}

export function requireGitHubOAuthEnv() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth is not configured");
  }
  return { clientId, clientSecret };
}

export function parsePullRequestUrl(url: string) {
  const trimmed = url.trim();
  const match = PR_URL_RE.exec(trimmed);
  if (!match) {
    throw new Error(
      "Paste a GitHub pull request URL like https://github.com/owner/repo/pull/123",
    );
  }
  return {
    owner: match[1]!,
    repo: match[2]!,
    number: Number(match[3]),
    url: `https://github.com/${match[1]}/${match[2]}/pull/${match[3]}`,
  };
}

export function parseRepoFullName(value: string) {
  const trimmed = value.trim();
  const match = REPO_RE.exec(trimmed);
  if (!match) {
    throw new Error("Repository must look like owner/name");
  }
  return { owner: match[1]!, name: match[2]! };
}

/** Branch name: cursor/<identifier-lowercase>-<title-slug> (~40 chars of title). */
export function issueBranchName(identifier: string, title: string) {
  const id = identifier.trim().toLowerCase();
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `cursor/${id}-${slug || "issue"}`;
}

export function publicConnection(doc: {
  githubLogin?: string;
  githubUserId?: string;
  createdAt: number;
  updatedAt: number;
} | null) {
  if (!doc) {
    return { connected: false as const, login: null, githubUserId: null };
  }
  return {
    connected: true as const,
    login: doc.githubLogin ?? null,
    githubUserId: doc.githubUserId ?? null,
  };
}
