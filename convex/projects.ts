import { z } from "zod";
import {
  assertCanManage,
  requireProjectAccess,
  requireWorkspaceMember,
} from "./lib/access";
import {
  projectIdSchema,
  projectStatusSchema,
  workspaceIdSchema,
  zMutation,
  zQuery,
} from "./lib/functions";
import { allocateProjectKey } from "./lib/keys";

export const list = zQuery({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);
    return await ctx.db
      .query("projects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(100);
  },
});

export const get = zQuery({
  args: { projectId: projectIdSchema },
  handler: async (ctx, args) => {
    const { project } = await requireProjectAccess(ctx, args.projectId);
    return project;
  },
});

export const create = zMutation({
  args: {
    workspaceId: workspaceIdSchema,
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(2000).optional(),
    status: projectStatusSchema.optional(),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);
    const now = Date.now();
    return await ctx.db.insert("projects", {
      name: args.name,
      description: args.description ?? "",
      key: await allocateProjectKey(ctx, args.workspaceId, args.name),
      workspaceId: args.workspaceId,
      status: args.status ?? "active",
      issueCounter: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = zMutation({
  args: {
    projectId: projectIdSchema,
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(2000).optional(),
    status: projectStatusSchema.optional(),
  },
  handler: async (ctx, args) => {
    const { project } = await requireProjectAccess(ctx, args.projectId);
    await ctx.db.patch("projects", project._id, {
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(args.status !== undefined ? { status: args.status } : {}),
      updatedAt: Date.now(),
    });
    return project._id;
  },
});

export const remove = zMutation({
  args: { projectId: projectIdSchema },
  handler: async (ctx, args) => {
    const { project, membership } = await requireProjectAccess(ctx, args.projectId);
    assertCanManage(membership);
    const issues = await ctx.db
      .query("issues")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .take(500);
    for (const issue of issues) {
      const comments = await ctx.db
        .query("comments")
        .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
        .take(200);
      for (const comment of comments) {
        const mentionRows = await ctx.db
          .query("mentions")
          .withIndex("by_comment", (q) => q.eq("commentId", comment._id))
          .take(50);
        for (const mention of mentionRows) {
          await ctx.db.delete("mentions", mention._id);
        }
        await ctx.db.delete("comments", comment._id);
      }
      await ctx.db.delete("issues", issue._id);
    }
    await ctx.db.delete("projects", project._id);
    return project._id;
  },
});
