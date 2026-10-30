import { z } from "zod";
import { loadPublicUser, requireIssueAccess } from "./lib/access";
import { commentIdSchema, issueIdSchema, zMutation, zQuery } from "./lib/functions";

export const list = zQuery({
  args: { issueId: issueIdSchema },
  handler: async (ctx, args) => {
    await requireIssueAccess(ctx, args.issueId);
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .take(200);
    const ordered = [...comments].sort((a, b) => a.createdAt - b.createdAt);
    const result = [];
    for (const comment of ordered) {
      result.push({
        _id: comment._id,
        issueId: comment.issueId,
        content: comment.content,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        author: await loadPublicUser(ctx, comment.authorId),
      });
    }
    return result;
  },
});

export const create = zMutation({
  args: {
    issueId: issueIdSchema,
    content: z.string().trim().min(1).max(10000),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireIssueAccess(ctx, args.issueId);
    const now = Date.now();
    return await ctx.db.insert("comments", {
      issueId: args.issueId,
      authorId: userId,
      content: args.content,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = zMutation({
  args: {
    commentId: commentIdSchema,
    content: z.string().trim().min(1).max(10000),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment) throw new Error("Comment not found");
    const { userId } = await requireIssueAccess(ctx, comment.issueId);
    if (comment.authorId !== userId) {
      throw new Error("You can only edit your own comments");
    }
    await ctx.db.patch("comments", comment._id, {
      content: args.content,
      updatedAt: Date.now(),
    });
    return comment._id;
  },
});

export const remove = zMutation({
  args: { commentId: commentIdSchema },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment) throw new Error("Comment not found");
    const { userId, membership } = await requireIssueAccess(ctx, comment.issueId);
    const canModerate = membership.role === "owner" || membership.role === "admin";
    if (comment.authorId !== userId && !canModerate) {
      throw new Error("You can only delete your own comments");
    }
    await ctx.db.delete("comments", comment._id);
    return comment._id;
  },
});
