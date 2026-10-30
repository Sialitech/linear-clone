import { z } from "zod";
import { requireWorkspaceMember } from "./lib/access";
import {
  assigneeModeSchema,
  issueStatusSchema,
  labelIdSchema,
  prioritySchema,
  projectIdSchema,
  userIdSchema,
  viewIdSchema,
  workspaceIdSchema,
  zMutation,
  zQuery,
} from "./lib/functions";

export const list = zQuery({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);
    return await ctx.db
      .query("views")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(100);
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
    assigneeMode: assigneeModeSchema,
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
      assigneeMode: args.assigneeMode,
      createdAt: Date.now(),
      ...(args.projectId ? { projectId: args.projectId } : {}),
      ...(args.status ? { status: args.status } : {}),
      ...(args.priority ? { priority: args.priority } : {}),
      ...(args.assigneeId ? { assigneeId: args.assigneeId } : {}),
      ...(args.labelId ? { labelId: args.labelId } : {}),
    });
  },
});

export const remove = zMutation({
  args: { viewId: viewIdSchema },
  handler: async (ctx, args) => {
    const view = await ctx.db.get("views", args.viewId);
    if (!view) throw new Error("View not found");
    const { userId, membership } = await requireWorkspaceMember(ctx, view.workspaceId);
    const canModerate = membership.role === "owner" || membership.role === "admin";
    if (view.ownerId !== userId && !canModerate) {
      throw new Error("You cannot delete this view");
    }
    await ctx.db.delete("views", view._id);
    return view._id;
  },
});
