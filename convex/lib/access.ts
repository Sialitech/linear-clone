import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type ReadCtx = QueryCtx | MutationCtx;

export async function requireUser(ctx: ReadCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  return userId;
}

export async function requireWorkspaceMember(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
): Promise<{ userId: Id<"users">; membership: Doc<"members"> }> {
  const userId = await requireUser(ctx);
  const membership = await ctx.db
    .query("members")
    .withIndex("by_workspace_and_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", userId),
    )
    .unique();
  if (!membership) {
    throw new Error("You do not have access to this workspace");
  }
  return { userId, membership };
}

export function assertCanManage(membership: Doc<"members">) {
  if (membership.role !== "owner" && membership.role !== "admin") {
    throw new Error("Only workspace owners and admins can do that");
  }
}

export async function requireIssueAccess(ctx: ReadCtx, issueId: Id<"issues">) {
  const issue = await ctx.db.get("issues", issueId);
  if (!issue) {
    throw new Error("Issue not found");
  }
  const access = await requireWorkspaceMember(ctx, issue.workspaceId);
  return { issue, ...access };
}

export async function requireProjectAccess(
  ctx: ReadCtx,
  projectId: Id<"projects">,
) {
  const project = await ctx.db.get("projects", projectId);
  if (!project) {
    throw new Error("Project not found");
  }
  const access = await requireWorkspaceMember(ctx, project.workspaceId);
  return { project, ...access };
}

export function publicUser(user: Doc<"users"> | null) {
  if (!user) return null;
  return {
    _id: user._id,
    name: user.name ?? null,
    email: user.email ?? null,
    image: user.image ?? null,
  };
}

export async function loadPublicUser(ctx: ReadCtx, userId: Id<"users">) {
  return publicUser(await ctx.db.get("users", userId));
}
