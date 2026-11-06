import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { z } from "zod";
import {
  assertCanManage,
  loadPublicUser,
  requireUser,
  requireWorkspaceMember,
} from "./lib/access";
import {
  workspaceIdSchema,
  zMutation,
  zQuery,
} from "./lib/functions";
import { allocateProjectKey, allocateSlug, toSearchText } from "./lib/keys";

const DEFAULT_LABELS = [
  { name: "Bug", color: "#f2555a" },
  { name: "Feature", color: "#5e6ad2" },
  { name: "Improvement", color: "#4cb782" },
] as const;

export const me = zQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return loadPublicUser(ctx, userId);
  },
});

export const updateProfile = zMutation({
  args: {
    name: z.string().trim().min(1).max(80),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await ctx.db.patch("users", userId, { name: args.name });
    return userId;
  },
});

export const renameWorkspace = zMutation({
  args: {
    workspaceId: workspaceIdSchema,
    name: z.string().trim().min(1).max(80),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireWorkspaceMember(ctx, args.workspaceId);
    assertCanManage(membership);
    await ctx.db.patch("workspaces", args.workspaceId, { name: args.name });
    return args.workspaceId;
  },
});

export const myWorkspaces = zQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const memberships = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(50);
    const workspaces = [];
    for (const membership of memberships) {
      const workspace = await ctx.db.get("workspaces", membership.workspaceId);
      if (!workspace) continue;
      workspaces.push({
        _id: workspace._id,
        name: workspace.name,
        slug: workspace.slug,
        role: membership.role,
      });
    }
    return workspaces;
  },
});

export const listMembers = zQuery({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);
    const memberships = await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(200);
    const members = [];
    for (const membership of memberships) {
      const user = await loadPublicUser(ctx, membership.userId);
      if (!user) continue;
      members.push({
        ...user,
        role: membership.role,
        joinedAt: membership.joinedAt,
      });
    }
    return members;
  },
});

async function findUserByEmail(ctx: MutationCtx, email: string) {
  const normalized = email.trim().toLowerCase();
  const variants = normalized === email.trim() ? [normalized] : [normalized, email.trim()];
  for (const variant of variants) {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", variant))
      .first();
    if (user) return user;
  }
  return null;
}

async function claimInvites(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get("users", userId);
  const email = user?.email?.trim().toLowerCase();
  if (!email) return;
  const invites = await ctx.db
    .query("invites")
    .withIndex("by_email", (q) => q.eq("email", email))
    .take(50);
  const now = Date.now();
  for (const invite of invites) {
    const existing = await ctx.db
      .query("members")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", invite.workspaceId).eq("userId", userId),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("members", {
        workspaceId: invite.workspaceId,
        userId,
        role: invite.role,
        joinedAt: now,
      });
    }
    await ctx.db.delete("invites", invite._id);
  }
}

export const addMember = zMutation({
  args: {
    workspaceId: workspaceIdSchema,
    email: z.string().trim().email().max(200),
    role: z.enum(["admin", "member"]),
  },
  handler: async (ctx, args) => {
    const { userId, membership } = await requireWorkspaceMember(ctx, args.workspaceId);
    assertCanManage(membership);
    const email = args.email.trim().toLowerCase();
    const user = await findUserByEmail(ctx, email);
    if (!user) {
      const pending = await ctx.db
        .query("invites")
        .withIndex("by_workspace_and_email", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("email", email),
        )
        .unique();
      if (pending) {
        await ctx.db.patch("invites", pending._id, { role: args.role });
        return { status: "invited" as const };
      }
      await ctx.db.insert("invites", {
        workspaceId: args.workspaceId,
        email,
        role: args.role,
        invitedBy: userId,
        createdAt: Date.now(),
      });
      return { status: "invited" as const };
    }
    const existing = await ctx.db
      .query("members")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", user._id),
      )
      .unique();
    if (existing) {
      throw new ConvexError("That person is already a member");
    }
    await ctx.db.insert("members", {
      workspaceId: args.workspaceId,
      userId: user._id,
      role: args.role,
      joinedAt: Date.now(),
    });
    return { status: "added" as const };
  },
});

export const listInvites = zQuery({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    const { membership } = await requireWorkspaceMember(ctx, args.workspaceId);
    assertCanManage(membership);
    const invites = await ctx.db
      .query("invites")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(100);
    return invites.map((invite) => ({
      _id: invite._id,
      email: invite.email,
      role: invite.role,
      createdAt: invite.createdAt,
    }));
  },
});

export const ensureWorkspace = zMutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    await claimInvites(ctx, userId);
    const existing = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) return existing.workspaceId;

    const user = await ctx.db.get("users", userId);
    const label = user?.name?.trim() || user?.email?.split("@")[0] || "Personal";
    const now = Date.now();
    const workspaceId = await ctx.db.insert("workspaces", {
      name: `${label}'s workspace`,
      slug: await allocateSlug(ctx, label),
      ownerId: userId,
      createdAt: now,
    });
    await ctx.db.insert("members", {
      workspaceId,
      userId,
      role: "owner",
      joinedAt: now,
    });
    const projectId = await ctx.db.insert("projects", {
      name: "General",
      description: "Default project",
      key: await allocateProjectKey(ctx, workspaceId, "General"),
      workspaceId,
      status: "active",
      issueCounter: 0,
      createdAt: now,
      updatedAt: now,
    });
    const samples = [
      {
        title: "Capture backlog ideas",
        status: "backlog" as const,
        priority: "none" as const,
        description: "Drop rough ideas here before they are ready to schedule.",
      },
      {
        title: "Set up the project",
        status: "done" as const,
        priority: "medium" as const,
        description: "Workspace, members, and the default project are ready.",
      },
      {
        title: "Design the issue list",
        status: "in_review" as const,
        priority: "high" as const,
        description: "Dense rows with status, priority, assignee, and labels.",
      },
      {
        title: "Build the Kanban board",
        status: "in_progress" as const,
        priority: "urgent" as const,
        description: "Drag issues across columns. Order is saved automatically.",
        assigneeId: userId,
      },
      {
        title: "Review the incoming bug report",
        status: "triage" as const,
        priority: "high" as const,
        description: "New reports wait in Triage until someone accepts or declines them.",
      },
      {
        title: "Write the first comment",
        status: "todo" as const,
        priority: "low" as const,
        description: "Open an issue and leave a comment. It shows up live.",
      },
    ];
    let number = 0;
    let commentIssueId: Id<"issues"> | null = null;
    for (const sample of samples) {
      number += 1;
      const issueId = await ctx.db.insert("issues", {
        title: sample.title,
        description: sample.description,
        searchText: toSearchText(sample.title, sample.description),
        projectId,
        workspaceId,
        creatorId: userId,
        status: sample.status,
        priority: sample.priority,
        labelIds: [],
        order: number,
        number,
        createdAt: now,
        updatedAt: now,
        ...("assigneeId" in sample ? { assigneeId: sample.assigneeId } : {}),
      });
      if (sample.status === "todo") commentIssueId = issueId;
    }
    await ctx.db.patch("projects", projectId, { issueCounter: number });
    if (commentIssueId) {
      await ctx.db.insert("comments", {
        issueId: commentIssueId,
        authorId: userId,
        content: "Comments update live for everyone looking at this issue.",
        createdAt: now,
        updatedAt: now,
      });
    }
    for (const labelDef of DEFAULT_LABELS) {
      await ctx.db.insert("labels", {
        name: labelDef.name,
        color: labelDef.color,
        workspaceId,
      });
    }
    await ctx.db.insert("views", {
      name: "All issues",
      workspaceId,
      ownerId: userId,
      assigneeMode: "anyone",
      createdAt: now,
    });
    await ctx.db.insert("views", {
      name: "My issues",
      workspaceId,
      ownerId: userId,
      assigneeMode: "me",
      createdAt: now,
    });
    return workspaceId;
  },
});
