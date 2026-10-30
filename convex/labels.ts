import { z } from "zod";
import { requireWorkspaceMember } from "./lib/access";
import { labelIdSchema, workspaceIdSchema, zMutation, zQuery } from "./lib/functions";

const COLOR = /^#[0-9a-fA-F]{6}$/;

export const list = zQuery({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);
    return await ctx.db
      .query("labels")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(100);
  },
});

export const create = zMutation({
  args: {
    workspaceId: workspaceIdSchema,
    name: z.string().trim().min(1).max(40),
    color: z.string().regex(COLOR),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);
    return await ctx.db.insert("labels", {
      name: args.name,
      color: args.color.toLowerCase(),
      workspaceId: args.workspaceId,
    });
  },
});

export const remove = zMutation({
  args: { labelId: labelIdSchema },
  handler: async (ctx, args) => {
    const label = await ctx.db.get("labels", args.labelId);
    if (!label) throw new Error("Label not found");
    await requireWorkspaceMember(ctx, label.workspaceId);
    await ctx.db.delete("labels", label._id);
    return label._id;
  },
});
