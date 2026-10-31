import { z } from "zod";
import type { Doc, Id } from "./_generated/dataModel";
import { requireWorkspaceMember } from "./lib/access";
import {
  assigneeModeSchema,
  issueStatusSchema,
  labelIdSchema,
  prioritySchema,
  projectIdSchema,
  userIdSchema,
  viewGroupSchema,
  viewOrderSchema,
  viewIdSchema,
  workspaceIdSchema,
  zMutation,
  zQuery,
} from "./lib/functions";

function isPlainView(view: Doc<"views">) {
  return (
    view.projectId === undefined &&
    view.status === undefined &&
    view.priority === undefined &&
    view.labelId === undefined &&
    view.assigneeId === undefined
  );
}

function viewRank(view: Doc<"views">) {
  if (isPlainView(view) && view.assigneeMode === "anyone") return 0;
  if (isPlainView(view) && view.assigneeMode === "me") return 1;
  return 2;
}

function isSeededHighPriority(view: Doc<"views">) {
  return (
    view.name === "High priority" &&
    view.priority === "high" &&
    view.assigneeMode === "anyone" &&
    view.projectId === undefined &&
    view.status === undefined &&
    view.labelId === undefined &&
    view.assigneeId === undefined
  );
}

function canManageView(ownerId: Id<"users">, userId: Id<"users">, role: "owner" | "admin" | "member") {
  return ownerId === userId || role === "owner" || role === "admin";
}

export const list = zQuery({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);
    const views = await ctx.db
      .query("views")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(100);
    return views
      .filter((view) => !isSeededHighPriority(view))
      .sort((a, b) => viewRank(a) - viewRank(b) || a.createdAt - b.createdAt);
  },
});

export const get = zQuery({
  args: { viewId: viewIdSchema },
  handler: async (ctx, args) => {
    const view = await ctx.db.get("views", args.viewId);
    if (!view) return null;
    await requireWorkspaceMember(ctx, view.workspaceId);
    return view;
  },
});

export const create = zMutation({
  args: {
    workspaceId: workspaceIdSchema,
    name: z.string().trim().min(1).max(80),
    projectId: projectIdSchema.optional(),
    status: issueStatusSchema.optional(),
    priority: prioritySchema.optional(),
    assigneeMode: assigneeModeSchema.optional(),
    assigneeId: userIdSchema.optional(),
    labelId: labelIdSchema.optional(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
    if (args.projectId) {
      const project = await ctx.db.get("projects", args.projectId);
      if (!project || project.workspaceId !== args.workspaceId) {
        throw new Error("Project is not in this workspace");
      }
    }
    if (args.labelId) {
      const label = await ctx.db.get("labels", args.labelId);
      if (!label || label.workspaceId !== args.workspaceId) {
        throw new Error("Label is not in this workspace");
      }
    }
    return await ctx.db.insert("views", {
      name: args.name,
      workspaceId: args.workspaceId,
      ownerId: userId,
      assigneeMode: args.assigneeMode ?? "anyone",
      createdAt: Date.now(),
      ...(args.projectId ? { projectId: args.projectId } : {}),
      ...(args.status ? { status: args.status } : {}),
      ...(args.priority ? { priority: args.priority } : {}),
      ...(args.assigneeId ? { assigneeId: args.assigneeId } : {}),
      ...(args.labelId ? { labelId: args.labelId } : {}),
    });
  },
});

export const update = zMutation({
  args: {
    viewId: viewIdSchema,
    projectId: projectIdSchema.nullable(),
    status: issueStatusSchema.nullable(),
    priority: prioritySchema.nullable(),
    assigneeMode: assigneeModeSchema,
    assigneeId: userIdSchema.nullable(),
    labelId: labelIdSchema.nullable(),
    groupBy: viewGroupSchema.nullable(),
    subGroupBy: viewGroupSchema.nullable(),
    orderBy: viewOrderSchema.nullable(),
  },
  handler: async (ctx, args) => {
    const view = await ctx.db.get("views", args.viewId);
    if (!view) throw new Error("View not found");
    const { userId, membership } = await requireWorkspaceMember(ctx, view.workspaceId);
    if (!canManageView(view.ownerId, userId, membership.role)) {
      throw new Error("You cannot edit this view");
    }
    if (args.projectId) {
      const project = await ctx.db.get("projects", args.projectId);
      if (!project || project.workspaceId !== view.workspaceId) {
        throw new Error("Project is not in this workspace");
      }
    }
    if (args.labelId) {
      const label = await ctx.db.get("labels", args.labelId);
      if (!label || label.workspaceId !== view.workspaceId) {
        throw new Error("Label is not in this workspace");
      }
    }
    let assigneeId: Id<"users"> | undefined;
    if (args.assigneeMode === "user") {
      if (!args.assigneeId) throw new Error("Choose an assignee");
      const assigneeIdValue = args.assigneeId;
      const member = await ctx.db
        .query("members")
        .withIndex("by_workspace_and_user", (q) =>
          q.eq("workspaceId", view.workspaceId).eq("userId", assigneeIdValue),
        )
        .unique();
      if (!member) throw new Error("Assignee is not in this workspace");
      assigneeId = assigneeIdValue;
    }
    await ctx.db.patch("views", view._id, {
      assigneeMode: args.assigneeMode,
      projectId: args.projectId ?? undefined,
      status: args.status ?? undefined,
      priority: args.priority ?? undefined,
      assigneeId,
      labelId: args.labelId ?? undefined,
      groupBy: args.groupBy ?? undefined,
      subGroupBy: args.subGroupBy && args.subGroupBy !== args.groupBy ? args.subGroupBy : undefined,
      orderBy: args.orderBy ?? undefined,
    });
    return view._id;
  },
});

export const remove = zMutation({
  args: { viewId: viewIdSchema },
  handler: async (ctx, args) => {
    const view = await ctx.db.get("views", args.viewId);
    if (!view) throw new Error("View not found");
    const { userId, membership } = await requireWorkspaceMember(ctx, view.workspaceId);
    if (!canManageView(view.ownerId, userId, membership.role)) {
      throw new Error("You cannot delete this view");
    }
    await ctx.db.delete("views", view._id);
    return view._id;
  },
});

export const rename = zMutation({
  args: {
    viewId: viewIdSchema,
    name: z.string().trim().min(1).max(80),
  },
  handler: async (ctx, args) => {
    const view = await ctx.db.get("views", args.viewId);
    if (!view) throw new Error("View not found");
    const { userId, membership } = await requireWorkspaceMember(ctx, view.workspaceId);
    if (!canManageView(view.ownerId, userId, membership.role)) {
      throw new Error("You cannot rename this view");
    }
    await ctx.db.patch("views", view._id, { name: args.name });
    return view._id;
  },
});

export const pruneSeeded = zMutation({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    const { userId, membership } = await requireWorkspaceMember(ctx, args.workspaceId);
    const views = await ctx.db
      .query("views")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(100);
    for (const view of views) {
      if (!isSeededHighPriority(view)) continue;
      if (!canManageView(view.ownerId, userId, membership.role)) continue;
      await ctx.db.delete("views", view._id);
    }
    return null;
  },
});
