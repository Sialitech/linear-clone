import { z } from "zod";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireWorkspaceMember } from "./lib/access";
import { normalizeFilters } from "./lib/viewFilters";
import {
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
  const filters = normalizeFilters(view);
  return (
    view.projectId === undefined &&
    filters.statuses.length === 0 &&
    filters.priorities.length === 0 &&
    filters.labelIds.length === 0
  );
}

function viewRank(view: Doc<"views">) {
  if (!isPlainView(view)) return 2;
  const { assignees } = normalizeFilters(view);
  if (assignees.length === 0) return 0;
  if (assignees.length === 1 && assignees[0] === "me") return 1;
  return 2;
}

function isSeededHighPriority(view: Doc<"views">) {
  const filters = normalizeFilters(view);
  return (
    view.name === "High priority" &&
    filters.priorities.length === 1 &&
    filters.priorities[0] === "high" &&
    filters.assignees.length === 0 &&
    view.projectId === undefined &&
    filters.statuses.length === 0 &&
    filters.labelIds.length === 0
  );
}

const filterArgs = {
  statuses: z.array(issueStatusSchema).max(7),
  priorities: z.array(prioritySchema).max(5),
  assignees: z.array(z.union([z.literal("me"), z.literal("unassigned"), userIdSchema])).max(50),
  labelIds: z.array(labelIdSchema).max(50),
};

type FilterInput = {
  projectId?: Id<"projects"> | null;
  assignees: ("me" | "unassigned" | Id<"users">)[];
  labelIds: Id<"labels">[];
};

async function assertFilterTargets(ctx: QueryCtx, workspaceId: Id<"workspaces">, input: FilterInput) {
  if (input.projectId) {
    const project = await ctx.db.get("projects", input.projectId);
    if (!project || project.workspaceId !== workspaceId) {
      throw new Error("Project is not in this workspace");
    }
  }
  for (const labelId of input.labelIds) {
    const label = await ctx.db.get("labels", labelId);
    if (!label || label.workspaceId !== workspaceId) {
      throw new Error("Label is not in this workspace");
    }
  }
  for (const ref of input.assignees) {
    if (ref === "me" || ref === "unassigned") continue;
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_and_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", ref))
      .unique();
    if (!member) throw new Error("Assignee is not in this workspace");
  }
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
    statuses: filterArgs.statuses.optional(),
    priorities: filterArgs.priorities.optional(),
    assignees: filterArgs.assignees.optional(),
    labelIds: filterArgs.labelIds.optional(),
    groupBy: viewGroupSchema.optional(),
    subGroupBy: viewGroupSchema.optional(),
    orderBy: viewOrderSchema.optional(),
    showSubIssues: z.boolean().optional(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
    const assignees = [...new Set(args.assignees ?? [])];
    const labelIds = [...new Set(args.labelIds ?? [])];
    await assertFilterTargets(ctx, args.workspaceId, { projectId: args.projectId, assignees, labelIds });
    const statuses = [...new Set(args.statuses ?? [])];
    const priorities = [...new Set(args.priorities ?? [])];
    return await ctx.db.insert("views", {
      name: args.name,
      workspaceId: args.workspaceId,
      ownerId: userId,
      // Las vistas nuevas guardan los filtros en los arrays; `assigneeMode` queda solo por compatibilidad.
      assigneeMode: assignees.length === 1 && assignees[0] === "me" ? "me" : "anyone",
      createdAt: Date.now(),
      ...(args.projectId ? { projectId: args.projectId } : {}),
      ...(statuses.length > 0 ? { statuses } : {}),
      ...(priorities.length > 0 ? { priorities } : {}),
      ...(assignees.length > 0 ? { assignees } : {}),
      ...(labelIds.length > 0 ? { labelIds } : {}),
      ...(args.groupBy ? { groupBy: args.groupBy } : {}),
      ...(args.subGroupBy && args.subGroupBy !== args.groupBy ? { subGroupBy: args.subGroupBy } : {}),
      ...(args.orderBy ? { orderBy: args.orderBy } : {}),
      ...(args.showSubIssues === false ? { showSubIssues: false } : {}),
    });
  },
});

export const update = zMutation({
  args: {
    viewId: viewIdSchema,
    projectId: projectIdSchema.nullable(),
    ...filterArgs,
    groupBy: viewGroupSchema.nullable(),
    subGroupBy: viewGroupSchema.nullable(),
    orderBy: viewOrderSchema.nullable(),
    showSubIssues: z.boolean(),
  },
  handler: async (ctx, args) => {
    const view = await ctx.db.get("views", args.viewId);
    if (!view) throw new Error("View not found");
    const { userId, membership } = await requireWorkspaceMember(ctx, view.workspaceId);
    if (!canManageView(view.ownerId, userId, membership.role)) {
      throw new Error("You cannot edit this view");
    }
    const assignees = [...new Set(args.assignees)];
    const labelIds = [...new Set(args.labelIds)];
    await assertFilterTargets(ctx, view.workspaceId, { projectId: args.projectId, assignees, labelIds });
    const statuses = [...new Set(args.statuses)];
    const priorities = [...new Set(args.priorities)];
    await ctx.db.patch("views", view._id, {
      assigneeMode: assignees.length === 1 && assignees[0] === "me" ? "me" : "anyone",
      projectId: args.projectId ?? undefined,
      statuses,
      priorities,
      assignees,
      labelIds,
      // Los campos singulares antiguos ya están volcados en los arrays.
      status: undefined,
      priority: undefined,
      assigneeId: undefined,
      labelId: undefined,
      groupBy: args.groupBy ?? undefined,
      subGroupBy: args.subGroupBy && args.subGroupBy !== args.groupBy ? args.subGroupBy : undefined,
      orderBy: args.orderBy ?? undefined,
      showSubIssues: args.showSubIssues,
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
