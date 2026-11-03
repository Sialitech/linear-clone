import { zid } from "convex-helpers/server/zod4";
import { z } from "zod";
import { requireWorkspaceMember } from "./lib/access";
import { workspaceIdSchema, zMutation, zQuery } from "./lib/functions";

const TOKEN_BYTES = 32;

export async function hashApiToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  const body = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `lin_${body}`;
}

export const list = zQuery({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
    const tokens = await ctx.db
      .query("apiTokens")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", userId),
      )
      .take(20);
    return tokens
      .map((token) => ({
        _id: token._id,
        name: token.name,
        tokenPrefix: token.tokenPrefix,
        createdAt: token.createdAt,
        lastUsedAt: token.lastUsedAt ?? null,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const create = zMutation({
  args: {
    workspaceId: workspaceIdSchema,
    name: z.string().trim().min(1).max(60),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
    const existing = await ctx.db
      .query("apiTokens")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", userId),
      )
      .take(20);
    if (existing.length >= 10) {
      throw new Error("You can keep up to 10 API tokens in this workspace");
    }
    const token = randomToken();
    const tokenHash = await hashApiToken(token);
    const now = Date.now();
    const id = await ctx.db.insert("apiTokens", {
      workspaceId: args.workspaceId,
      userId,
      name: args.name,
      tokenHash,
      tokenPrefix: token.slice(0, 12),
      createdAt: now,
    });
    return { id, token, tokenPrefix: token.slice(0, 12) };
  },
});

export const revoke = zMutation({
  args: { workspaceId: workspaceIdSchema, tokenId: zid("apiTokens") },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
    const token = await ctx.db.get("apiTokens", args.tokenId);
    if (!token || token.workspaceId !== args.workspaceId || token.userId !== userId) {
      throw new Error("Token not found");
    }
    await ctx.db.delete("apiTokens", token._id);
    return token._id;
  },
});
