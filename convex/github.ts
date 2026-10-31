import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  assertCanManage,
  requireIssueAccess,
  requireProjectAccess,
  requireWorkspaceMember,
} from "./lib/access";
import {
  issueIdSchema,
  projectIdSchema,
  pullRequestIdSchema,
  workspaceIdSchema,
  zAction,
  zMutation,
  zQuery,
} from "./lib/functions";

const githubOwnerSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/, "Invalid GitHub owner");
const githubRepoSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/, "Invalid GitHub repository");

const prUrlSchema = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((value) => parsePullRequestUrl(value) !== null, {
    message: "Paste a GitHub pull request URL",
  });

function githubClientId() {
  const value = process.env.GITHUB_CLIENT_ID?.trim();
  return value && value.length > 0 ? value : null;
}

function githubClientSecret() {
  const value = process.env.GITHUB_CLIENT_SECRET?.trim();
  return value && value.length > 0 ? value : null;
}

function oauthConfigured() {
  return Boolean(githubClientId() && githubClientSecret());
}

function siteUrl() {
  const value = process.env.SITE_URL?.trim();
  if (!value) return null;
  return value.replace(/\/$/, "");
}

function convexSiteUrl() {
  const value = process.env.CONVEX_SITE_URL?.trim();
  if (!value) return null;
  return value.replace(/\/$/, "");
}

export function parsePullRequestUrl(url: string) {
  try {
    const parsed = new URL(url.trim());
    if (parsed.hostname !== "github.com" && parsed.hostname !== "www.github.com") {
      return null;
    }
    const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/);
    if (!match) return null;
    const owner = match[1];
    const repo = match[2];
    const number = Number(match[3]);
    if (!owner || !repo || !Number.isFinite(number)) return null;
    return {
      owner,
      repo,
      number,
      url: `https://github.com/${owner}/${repo}/pull/${number}`,
    };
  } catch {
    return null;
  }
}

function publicPullRequest(doc: {
  _id: Id<"pullRequests">;
  workspaceId: Id<"workspaces">;
  issueId: Id<"issues">;
  owner: string;
  repo: string;
  number: number;
  url: string;
  title?: string;
  state?: "open" | "closed" | "merged";
  updatedAt: number;
}) {
  return {
    _id: doc._id,
    workspaceId: doc.workspaceId,
    issueId: doc.issueId,
    owner: doc.owner,
    repo: doc.repo,
    number: doc.number,
    url: doc.url,
    title: doc.title ?? null,
    state: doc.state ?? null,
    updatedAt: doc.updatedAt,
    label: `${doc.repo}#${doc.number}`,
  };
}

export const oauthStatus = zQuery({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", userId),
      )
      .unique();
    return {
      configured: oauthConfigured(),
      connected: Boolean(connection),
      providerUserId: connection?.providerUserId ?? null,
    };
  },
});

export const listProjectRepos = zQuery({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);
    const repos = await ctx.db
      .query("projectRepos")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(200);
    return repos.map((repo) => ({
      _id: repo._id,
      workspaceId: repo.workspaceId,
      projectId: repo.projectId,
      owner: repo.owner,
      name: repo.name,
      fullName: `${repo.owner}/${repo.name}`,
      updatedAt: repo.updatedAt,
    }));
  },
});

export const listPullRequests = zQuery({
  args: { issueId: issueIdSchema },
  handler: async (ctx, args) => {
    await requireIssueAccess(ctx, args.issueId);
    const rows = await ctx.db
      .query("pullRequests")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .take(50);
    return rows.map(publicPullRequest);
  },
});

export const setProjectRepo = zMutation({
  args: {
    projectId: projectIdSchema,
    owner: githubOwnerSchema,
    name: githubRepoSchema,
  },
  handler: async (ctx, args) => {
    const { project, membership } = await requireProjectAccess(ctx, args.projectId);
    assertCanManage(membership);
    const owner = args.owner;
    const name = args.name.replace(/\.git$/i, "");
    const existing = await ctx.db
      .query("projectRepos")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch("projectRepos", existing._id, {
        owner,
        name,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("projectRepos", {
      workspaceId: project.workspaceId,
      projectId: project._id,
      owner,
      name,
      updatedAt: now,
    });
  },
});

export const clearProjectRepo = zMutation({
  args: { projectId: projectIdSchema },
  handler: async (ctx, args) => {
    const { project, membership } = await requireProjectAccess(ctx, args.projectId);
    assertCanManage(membership);
    const existing = await ctx.db
      .query("projectRepos")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .unique();
    if (existing) {
      await ctx.db.delete("projectRepos", existing._id);
    }
    return null;
  },
});

export const beginOAuth = zMutation({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    const { userId, membership } = await requireWorkspaceMember(ctx, args.workspaceId);
    assertCanManage(membership);
    const clientId = githubClientId();
    if (!clientId || !githubClientSecret()) {
      throw new Error("GitHub OAuth is not configured");
    }
    const redirectBase = convexSiteUrl();
    if (!redirectBase) {
      throw new Error("CONVEX_SITE_URL is not available");
    }
    const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    await ctx.db.insert("githubOAuthStates", {
      state,
      workspaceId: args.workspaceId,
      userId,
      createdAt: Date.now(),
    });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${redirectBase}/github/oauth/callback`,
      scope: "repo read:user",
      state,
    });
    return {
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
    };
  },
});

export const disconnect = zMutation({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    const { userId, membership } = await requireWorkspaceMember(ctx, args.workspaceId);
    assertCanManage(membership);
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", userId),
      )
      .unique();
    if (connection) {
      await ctx.db.delete("githubConnections", connection._id);
    }
    return null;
  },
});

export const linkPullRequest = zMutation({
  args: {
    issueId: issueIdSchema,
    url: prUrlSchema,
  },
  handler: async (ctx, args) => {
    const { issue } = await requireIssueAccess(ctx, args.issueId);
    const parsed = parsePullRequestUrl(args.url);
    if (!parsed) {
      throw new Error("Paste a GitHub pull request URL");
    }
    const existing = await ctx.db
      .query("pullRequests")
      .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
      .take(50);
    const duplicate = existing.find(
      (row) =>
        row.owner.toLowerCase() === parsed.owner.toLowerCase() &&
        row.repo.toLowerCase() === parsed.repo.toLowerCase() &&
        row.number === parsed.number,
    );
    if (duplicate) {
      return duplicate._id;
    }
    return await ctx.db.insert("pullRequests", {
      workspaceId: issue.workspaceId,
      issueId: issue._id,
      owner: parsed.owner,
      repo: parsed.repo,
      number: parsed.number,
      url: parsed.url,
      updatedAt: Date.now(),
    });
  },
});

export const unlinkPullRequest = zMutation({
  args: { pullRequestId: pullRequestIdSchema },
  handler: async (ctx, args) => {
    const pullRequest = await ctx.db.get("pullRequests", args.pullRequestId);
    if (!pullRequest) {
      throw new Error("Pull request link not found");
    }
    await requireIssueAccess(ctx, pullRequest.issueId);
    await ctx.db.delete("pullRequests", pullRequest._id);
    return null;
  },
});

export const refreshPullRequest = zAction({
  args: { pullRequestId: pullRequestIdSchema },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    const pullRequest = await ctx.runQuery(internal.github.getPullRequestInternal, {
      pullRequestId: args.pullRequestId,
    });
    if (!pullRequest) {
      throw new Error("Pull request link not found");
    }
    const membership = await ctx.runQuery(internal.github.getMembershipInternal, {
      workspaceId: pullRequest.workspaceId,
      userId,
    });
    if (!membership) {
      throw new Error("You do not have access to this workspace");
    }
    const token = await ctx.runQuery(internal.github.getAccessTokenInternal, {
      workspaceId: pullRequest.workspaceId,
      userId,
    });
    if (!token) {
      return { refreshed: false as const, reason: "no_token" as const };
    }
    const response = await fetch(
      `https://api.github.com/repos/${pullRequest.owner}/${pullRequest.repo}/pulls/${pullRequest.number}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "linear-clone",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!response.ok) {
      return { refreshed: false as const, reason: "github_error" as const };
    }
    const body = (await response.json()) as {
      title?: string;
      state?: string;
      merged?: boolean;
    };
    const state: "open" | "closed" | "merged" =
      body.merged === true ? "merged" : body.state === "closed" ? "closed" : "open";
    await ctx.runMutation(internal.github.patchPullRequestInternal, {
      pullRequestId: pullRequest._id,
      title: typeof body.title === "string" ? body.title : undefined,
      state,
    });
    return { refreshed: true as const };
  },
});

export const getPullRequestInternal = internalQuery({
  args: { pullRequestId: v.id("pullRequests") },
  handler: async (ctx, args) => {
    return await ctx.db.get("pullRequests", args.pullRequestId);
  },
});

export const getMembershipInternal = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("members")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.userId),
      )
      .unique();
  },
});

export const getAccessTokenInternal = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.userId),
      )
      .unique();
    return connection?.accessToken ?? null;
  },
});

export const patchPullRequestInternal = internalMutation({
  args: {
    pullRequestId: v.id("pullRequests"),
    title: v.optional(v.string()),
    state: v.union(v.literal("open"), v.literal("closed"), v.literal("merged")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("pullRequests", args.pullRequestId, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      state: args.state,
      updatedAt: Date.now(),
    });
  },
});

export const consumeOAuthStateInternal = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("githubOAuthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .unique();
    if (!row) return null;
    const ageMs = Date.now() - row.createdAt;
    await ctx.db.delete("githubOAuthStates", row._id);
    if (ageMs > 15 * 60 * 1000) {
      return null;
    }
    return {
      workspaceId: row.workspaceId,
      userId: row.userId,
    };
  },
});

export const saveConnectionInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    providerUserId: v.string(),
    accessToken: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubConnections")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.userId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("githubConnections", existing._id, {
        providerUserId: args.providerUserId,
        accessToken: args.accessToken,
        createdAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("githubConnections", {
      workspaceId: args.workspaceId,
      userId: args.userId,
      providerUserId: args.providerUserId,
      accessToken: args.accessToken,
      createdAt: Date.now(),
    });
  },
});

export async function exchangeGithubCode(code: string) {
  const clientId = githubClientId();
  const clientSecret = githubClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth is not configured");
  }
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error("GitHub token exchange failed");
  }
  const tokenBody = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!tokenBody.access_token) {
    throw new Error(tokenBody.error ?? "GitHub token exchange failed");
  }
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${tokenBody.access_token}`,
      "User-Agent": "linear-clone",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!userResponse.ok) {
    throw new Error("Failed to load GitHub user");
  }
  const userBody = (await userResponse.json()) as { id?: number | string };
  if (userBody.id === undefined) {
    throw new Error("GitHub user id missing");
  }
  return {
    accessToken: tokenBody.access_token,
    providerUserId: String(userBody.id),
  };
}

export function oauthRedirectTarget() {
  return siteUrl() ?? "/";
}
