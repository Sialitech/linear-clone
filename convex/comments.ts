import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { z } from "zod";
import { loadPublicUser, requireIssueAccess, type ReadCtx } from "./lib/access";
import {
  commentIdSchema,
  issueIdSchema,
  userIdSchema,
  zMutation,
  zQuery,
} from "./lib/functions";

const mentionIdsSchema = z.array(userIdSchema).max(20);

async function assertMentionMembers(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
  mentionIds: Id<"users">[],
) {
  const unique = [...new Set(mentionIds)];
  for (const userId of unique) {
    const membership = await ctx.db
      .query("members")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", workspaceId).eq("userId", userId),
      )
      .unique();
    if (!membership) {
      throw new Error("Mentioned user is not a member of this workspace");
    }
  }
  return unique;
}

async function deleteMentionsForComment(ctx: MutationCtx, commentId: Id<"comments">) {
  for (let pass = 0; pass < 10; pass += 1) {
    const rows = await ctx.db
      .query("mentions")
      .withIndex("by_comment", (q) => q.eq("commentId", commentId))
      .take(50);
    for (const row of rows) {
      await ctx.db.delete("mentions", row._id);
    }
    if (rows.length < 50) break;
  }
}

async function writeMentions(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    issueId: Id<"issues">;
    commentId: Id<"comments">;
    authorId: Id<"users">;
    mentionIds: Id<"users">[];
    createdAt: number;
  },
) {
  for (const mentionedUserId of args.mentionIds) {
    if (mentionedUserId === args.authorId) continue;
    await ctx.db.insert("mentions", {
      workspaceId: args.workspaceId,
      issueId: args.issueId,
      commentId: args.commentId,
      mentionedUserId,
      authorId: args.authorId,
      createdAt: args.createdAt,
    });
  }
}

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
        mentionIds: comment.mentionIds ?? [],
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
    mentionIds: mentionIdsSchema.optional(),
  },
  handler: async (ctx, args) => {
    const { userId, issue } = await requireIssueAccess(ctx, args.issueId);
    const mentionIds = await assertMentionMembers(
      ctx,
      issue.workspaceId,
      args.mentionIds ?? [],
    );
    const now = Date.now();
    const commentId = await ctx.db.insert("comments", {
      issueId: args.issueId,
      authorId: userId,
      content: args.content,
      mentionIds,
      createdAt: now,
      updatedAt: now,
    });
    await writeMentions(ctx, {
      workspaceId: issue.workspaceId,
      issueId: issue._id,
      commentId,
      authorId: userId,
      mentionIds,
      createdAt: now,
    });
    return commentId;
  },
});

export const update = zMutation({
  args: {
    commentId: commentIdSchema,
    content: z.string().trim().min(1).max(10000),
    mentionIds: mentionIdsSchema.optional(),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment) throw new Error("Comment not found");
    const { userId, issue } = await requireIssueAccess(ctx, comment.issueId);
    if (comment.authorId !== userId) {
      throw new Error("You can only edit your own comments");
    }
    const mentionIds = await assertMentionMembers(
      ctx,
      issue.workspaceId,
      args.mentionIds ?? [],
    );
    const now = Date.now();
    await ctx.db.patch("comments", comment._id, {
      content: args.content,
      mentionIds,
      updatedAt: now,
    });
    await deleteMentionsForComment(ctx, comment._id);
    await writeMentions(ctx, {
      workspaceId: issue.workspaceId,
      issueId: issue._id,
      commentId: comment._id,
      authorId: userId,
      mentionIds,
      createdAt: now,
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
    await deleteMentionsForComment(ctx, comment._id);
    await ctx.db.delete("comments", comment._id);
    return comment._id;
  },
});
