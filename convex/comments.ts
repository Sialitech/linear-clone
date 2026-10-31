import { z } from "zod";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { loadPublicUser, requireIssueAccess, type ReadCtx } from "./lib/access";
import {
  commentIdSchema,
  issueIdSchema,
  userIdSchema,
  zMutation,
  zQuery,
} from "./lib/functions";

const mentionIdsSchema = z.array(userIdSchema).max(50);

async function assertMentionMembers(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
  mentionIds: Id<"users">[],
) {
  for (const mentionId of mentionIds) {
    const membership = await ctx.db
      .query("members")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", workspaceId).eq("userId", mentionId),
      )
      .unique();
    if (!membership) {
      throw new Error("Mentioned user is not a member of this workspace");
    }
  }
}

function uniqueMentionIds(mentionIds: Id<"users">[] | undefined): Id<"users">[] {
  if (!mentionIds || mentionIds.length === 0) return [];
  return [...new Set(mentionIds)];
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
      const mentionIds = comment.mentionIds ?? [];
      result.push({
        _id: comment._id,
        issueId: comment.issueId,
        content: comment.content,
        mentionIds,
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
    const mentionIds = uniqueMentionIds(args.mentionIds);
    await assertMentionMembers(ctx, issue.workspaceId, mentionIds);
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
    const mentionIds = uniqueMentionIds(args.mentionIds);
    await assertMentionMembers(ctx, issue.workspaceId, mentionIds);
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
