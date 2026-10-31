import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/** Store GitHub OAuth token. Never returned by public queries. */
export const upsertConnection = internalMutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    githubLogin: v.optional(v.string()),
    githubUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch("githubConnections", existing._id, {
        accessToken: args.accessToken,
        githubLogin: args.githubLogin,
        githubUserId: args.githubUserId,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("githubConnections", {
      userId: args.userId,
      accessToken: args.accessToken,
      githubLogin: args.githubLogin,
      githubUserId: args.githubUserId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getConnectionToken = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (!connection) return null;
    return {
      accessToken: connection.accessToken,
      githubLogin: connection.githubLogin ?? null,
    };
  },
});

export const patchPullRequestMeta = internalMutation({
  args: {
    pullRequestId: v.id("pullRequests"),
    title: v.optional(v.string()),
    state: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("pullRequests", args.pullRequestId);
    if (!row) return null;
    await ctx.db.patch("pullRequests", row._id, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.state !== undefined ? { state: args.state } : {}),
      updatedAt: Date.now(),
    });
    return row._id as Id<"pullRequests">;
  },
});

export const getPullRequest = internalQuery({
  args: { pullRequestId: v.id("pullRequests") },
  handler: async (ctx, args) => {
    return await ctx.db.get("pullRequests", args.pullRequestId);
  },
});
