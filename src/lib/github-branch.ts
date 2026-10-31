/** Build a Linear-style branch name from an issue identifier and title. */
export function issueBranchName(identifier: string, title: string) {
  const id = identifier.trim().toLowerCase();
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug.length > 0 ? `cursor/${id}-${slug}` : `cursor/${id}`;
}
