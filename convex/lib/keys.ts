import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : "workspace";
}

export function projectKeyFromName(name: string) {
  const letters = name.replace(/[^a-zA-Z]/g, "").toUpperCase();
  return (letters.slice(0, 3) || "PRJ").padEnd(3, "X");
}

export async function allocateSlug(ctx: MutationCtx, name: string) {
  const base = slugify(name);
  let slug = base;
  let suffix = 2;
  while (
    await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique()
  ) {
    slug = `${base}-${suffix}`;
    suffix += 1;
    if (suffix > 40) {
      throw new Error("Could not allocate a workspace slug");
    }
  }
  return slug;
}

export async function allocateProjectKey(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  name: string,
) {
  const base = projectKeyFromName(name);
  let key = base;
  let suffix = 2;
  while (
    await ctx.db
      .query("projects")
      .withIndex("by_workspace_and_key", (q) =>
        q.eq("workspaceId", workspaceId).eq("key", key),
      )
      .unique()
  ) {
    key = `${base.slice(0, 2)}${suffix}`;
    suffix += 1;
    if (suffix > 30) {
      throw new Error("Could not allocate a project key");
    }
  }
  return key;
}

export function toSearchText(title: string, description: string) {
  return `${title}\n${description}`.slice(0, 4000);
}
