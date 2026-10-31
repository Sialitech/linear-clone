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

export function parsePullRequestUrlClient(url: string) {
  const trimmed = url.trim();
  const match =
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)\/?$/i.exec(
      trimmed,
    );
  if (!match) return null;
  return {
    owner: match[1]!,
    repo: match[2]!,
    number: Number(match[3]),
    url: `https://github.com/${match[1]}/${match[2]}/pull/${match[3]}`,
  };
}
