import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type ActionCtx, type MutationCtx } from "./_generated/server";
import {
  assertCanManage,
  requireIssueAccess,
  requireProjectAccess,
  requireWorkspaceMember,
  type ReadCtx,
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
import {
  githubInstallUrl,
  normalizeReturnOrigin,
  parseGithubTokenBody,
  parseGithubUser,
  parseManifestApp,
  parsePullRequestUrl,
} from "./lib/github";

const OAUTH_STATE_TTL_MS = 30 * 60 * 1000;

export { parsePullRequestUrl };

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

function presentEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function githubAppPrivateKeyFromEnv() {
  const value = presentEnv("GITHUB_APP_PRIVATE_KEY");
  if (!value) return null;
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

async function loadPlatformApp(ctx: ReadCtx) {
  const slug = presentEnv("GITHUB_APP_SLUG");
  const appIdText = presentEnv("GITHUB_APP_ID");
  const privateKey = githubAppPrivateKeyFromEnv();
  const appId = appIdText && /^\d+$/.test(appIdText) ? Number(appIdText) : null;
  if (slug && appId !== null && privateKey) {
    return {
      appId,
      slug,
      privateKey,
      clientId: presentEnv("GITHUB_APP_CLIENT_ID") ?? githubClientId(),
      clientSecret: presentEnv("GITHUB_APP_CLIENT_SECRET") ?? githubClientSecret(),
    };
  }
  const row = await ctx.db
    .query("githubPlatformApp")
    .withIndex("by_singleton", (q) => q.eq("singleton", "app"))
    .unique();
  if (!row) return null;
  return {
    appId: row.appId,
    slug: row.slug,
    privateKey: row.privateKey,
    clientId: row.clientId,
    clientSecret: row.clientSecret,
  };
}

function newOAuthState() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

async function insertOAuthState(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    userId: Id<"users">;
    returnOrigin: string;
    kind: "manifest" | "connect";
  },
) {
  const returnOrigin = normalizeReturnOrigin(args.returnOrigin);
  if (!returnOrigin) {
    throw new Error("Open Settings in the app and try connecting again");
  }
  const state = newOAuthState();
  await ctx.db.insert("githubOAuthStates", {
    state,
    workspaceId: args.workspaceId,
    userId: args.userId,
    returnOrigin,
    kind: args.kind,
    createdAt: Date.now(),
  });
  return state;
}

async function loadOAuthCredentials(ctx: ReadCtx, workspaceId: Id<"workspaces">) {
  const clientId = githubClientId();
  const clientSecret = githubClientSecret();
  if (clientId && clientSecret) {
    return { clientId, clientSecret, mode: "oauth_app" as const };
  }
  const app = await ctx.db
    .query("githubApps")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .unique();
  if (!app) return null;
  return {
    clientId: app.clientId,
    clientSecret: app.clientSecret,
    mode: "github_app" as const,
    slug: app.slug,
  };
}

function presentText(value: string | undefined) {
  return value && value.length > 0 ? value : null;
}

function convexSiteUrl() {
  const value = process.env.CONVEX_SITE_URL?.trim();
  if (!value) return null;
  return value.replace(/\/$/, "");
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
    const installation = await ctx.db
      .query("githubInstallations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .first();
    const platform = await loadPlatformApp(ctx);
    const installed = Boolean(installation);
    return {
      configured: Boolean(platform?.slug),
      installed,
      connected: installed || Boolean(connection),
      login: installation?.accountLogin ?? presentText(connection?.login),
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

const returnOriginSchema = z.string().trim().min(1).max(200);

export const beginOAuth = zMutation({
  args: {
    workspaceId: workspaceIdSchema,
    returnOrigin: returnOriginSchema,
  },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
    const platform = await loadPlatformApp(ctx);
    if (!platform?.slug) {
      throw new Error("GitHub is not available yet");
    }
    const state = await insertOAuthState(ctx, {
      workspaceId: args.workspaceId,
      userId,
      returnOrigin: args.returnOrigin,
      kind: "connect",
    });
    return {
      kind: "install" as const,
      url: githubInstallUrl(platform.slug, state),
    };
  },
});

export const disconnect = zAction({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    const membership = await ctx.runQuery(internal.github.getMembershipInternal, {
      workspaceId: args.workspaceId,
      userId,
    });
    if (!membership) {
      throw new Error("You do not have access to this workspace");
    }
    const canManage = membership.role === "owner" || membership.role === "admin";
    if (canManage) {
      await ctx.runAction(internal.githubNode.deleteInstallations, {
        workspaceId: args.workspaceId,
      });
      await ctx.runMutation(internal.github.clearInstallationsInternal, {
        workspaceId: args.workspaceId,
      });
      return null;
    }
    await ctx.runMutation(internal.github.clearUserConnectionInternal, {
      workspaceId: args.workspaceId,
      userId,
    });
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
    const installed = await ctx.runAction(internal.githubNode.fetchInstalledPullRequest, {
      workspaceId: pullRequest.workspaceId,
      owner: pullRequest.owner,
      repo: pullRequest.repo,
      number: pullRequest.number,
    });
    if (installed?.found) {
      await ctx.runMutation(internal.github.patchPullRequestInternal, {
        pullRequestId: pullRequest._id,
        ...(installed.title !== undefined ? { title: installed.title } : {}),
        state: installed.state,
      });
      return { refreshed: true as const };
    }
    if (installed && !installed.found) {
      return { refreshed: false as const, reason: "github_error" as const };
    }
    const session = await ctx.runQuery(internal.github.getGithubSessionInternal, {
      workspaceId: pullRequest.workspaceId,
      userId,
    });
    if (!session) {
      return { refreshed: false as const, reason: "no_token" as const };
    }
    let token = session.accessToken;
    const expiresSoon = session.expiresAt !== null && session.expiresAt <= Date.now() + 60_000;
    if (expiresSoon) {
      const refreshed = await persistRefreshedToken(ctx, session, pullRequest.workspaceId, userId);
      if (!refreshed) {
        return { refreshed: false as const, reason: "github_error" as const };
      }
      token = refreshed;
    }
    let response = await fetchPullRequest(pullRequest, token);
    if (response.status === 401 && session.refreshToken && !expiresSoon) {
      const refreshed = await persistRefreshedToken(ctx, session, pullRequest.workspaceId, userId);
      if (!refreshed) {
        return { refreshed: false as const, reason: "github_error" as const };
      }
      response = await fetchPullRequest(pullRequest, refreshed);
    }
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

export const getGithubSessionInternal = internalQuery({
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
    if (!connection) return null;
    const credentials = await loadOAuthCredentials(ctx, args.workspaceId);
    return {
      accessToken: connection.accessToken,
      refreshToken: presentText(connection.refreshToken),
      expiresAt: connection.expiresAt && connection.expiresAt > 0 ? connection.expiresAt : null,
      clientId: credentials?.clientId ?? null,
      clientSecret: credentials?.clientSecret ?? null,
    };
  },
});

export const credentialsInternal = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const credentials = await loadOAuthCredentials(ctx, args.workspaceId);
    if (!credentials) return null;
    return {
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      mode: credentials.mode,
    };
  },
});

export const connectRedirectInternal = internalQuery({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("githubOAuthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .unique();
    if (!row || (row.kind ?? "connect") !== "connect") return null;
    if (Date.now() - row.createdAt > OAUTH_STATE_TTL_MS) return null;
    const redirectBase = convexSiteUrl();
    if (!redirectBase || !row.returnOrigin) return null;
    const platform = await loadPlatformApp(ctx);
    if (!platform?.slug) return null;
    return { url: githubInstallUrl(platform.slug, row.state) };
  },
});

export const platformRegisteredInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const platform = await loadPlatformApp(ctx);
    return { registered: Boolean(platform) };
  },
});

export const platformCredentialsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const platform = await loadPlatformApp(ctx);
    if (!platform) return null;
    return {
      appId: String(platform.appId),
      privateKey: platform.privateKey,
    };
  },
});

export const installTargetsInternal = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    owner: v.string(),
  },
  handler: async (ctx, args) => {
    const platform = await loadPlatformApp(ctx);
    if (!platform) return null;
    const rows = await ctx.db
      .query("githubInstallations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(20);
    if (rows.length === 0) return null;
    const owner = args.owner.toLowerCase();
    const sorted = [...rows].sort((left, right) => {
      const leftMatch = owner.length > 0 && left.accountLogin.toLowerCase() === owner ? 0 : 1;
      const rightMatch = owner.length > 0 && right.accountLogin.toLowerCase() === owner ? 0 : 1;
      return leftMatch - rightMatch;
    });
    return {
      appId: String(platform.appId),
      privateKey: platform.privateKey,
      installationIds: sorted.map((row) => row.installationId),
    };
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
  args: {
    state: v.string(),
    kind: v.union(v.literal("manifest"), v.literal("connect")),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("githubOAuthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .unique();
    if (!row) return null;
    if ((row.kind ?? "connect") !== args.kind) return null;
    const ageMs = Date.now() - row.createdAt;
    await ctx.db.delete("githubOAuthStates", row._id);
    if (ageMs > OAUTH_STATE_TTL_MS) return null;
    return {
      workspaceId: row.workspaceId,
      userId: row.userId,
      returnOrigin: presentText(row.returnOrigin),
    };
  },
});

export const createOAuthStateInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    returnOrigin: v.string(),
    kind: v.union(v.literal("manifest"), v.literal("connect")),
  },
  handler: async (ctx, args) => {
    return await insertOAuthState(ctx, args);
  },
});

export const savePlatformAppInternal = internalMutation({
  args: {
    appId: v.number(),
    slug: v.string(),
    name: v.string(),
    clientId: v.string(),
    clientSecret: v.string(),
    privateKey: v.string(),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubPlatformApp")
      .withIndex("by_singleton", (q) => q.eq("singleton", "app"))
      .unique();
    if (existing) return null;
    return await ctx.db.insert("githubPlatformApp", {
      singleton: "app",
      appId: args.appId,
      slug: args.slug,
      name: args.name,
      clientId: args.clientId,
      clientSecret: args.clientSecret,
      privateKey: args.privateKey,
      ...(args.webhookSecret ? { webhookSecret: args.webhookSecret } : {}),
      createdAt: Date.now(),
    });
  },
});

export const saveInstallationInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    installationId: v.number(),
    accountLogin: v.string(),
    accountType: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubInstallations")
      .withIndex("by_installation", (q) => q.eq("installationId", args.installationId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        workspaceId: args.workspaceId,
        accountLogin: args.accountLogin,
        accountType: args.accountType,
      });
      return existing._id;
    }
    return await ctx.db.insert("githubInstallations", {
      workspaceId: args.workspaceId,
      installationId: args.installationId,
      accountLogin: args.accountLogin,
      accountType: args.accountType,
      createdAt: Date.now(),
    });
  },
});

export const clearInstallationsInternal = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const installations = await ctx.db
      .query("githubInstallations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(50);
    for (const row of installations) {
      await ctx.db.delete("githubInstallations", row._id);
    }
    const connections = await ctx.db
      .query("githubConnections")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(200);
    for (const row of connections) {
      await ctx.db.delete("githubConnections", row._id);
    }
    return null;
  },
});

export const clearUserConnectionInternal = internalMutation({
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
    if (connection) {
      await ctx.db.delete("githubConnections", connection._id);
    }
    return null;
  },
});

export const saveGithubAppInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    appId: v.number(),
    slug: v.string(),
    name: v.string(),
    clientId: v.string(),
    clientSecret: v.string(),
    privateKey: v.string(),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubApps")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique();
    const fields = {
      appId: args.appId,
      slug: args.slug,
      name: args.name,
      clientId: args.clientId,
      clientSecret: args.clientSecret,
      privateKey: args.privateKey,
      ...(args.webhookSecret ? { webhookSecret: args.webhookSecret } : {}),
      createdAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("githubApps", {
      workspaceId: args.workspaceId,
      ...fields,
    });
  },
});

export const saveConnectionInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    providerUserId: v.string(),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    login: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubConnections")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.userId),
      )
      .unique();
    const fields = {
      providerUserId: args.providerUserId,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken ?? "",
      expiresAt: args.expiresAt ?? 0,
      login: args.login ?? "",
      createdAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch("githubConnections", existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("githubConnections", {
      workspaceId: args.workspaceId,
      userId: args.userId,
      ...fields,
    });
  },
});

export const updateTokensInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubConnections")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.userId),
      )
      .unique();
    if (!existing) return null;
    await ctx.db.patch("githubConnections", existing._id, {
      accessToken: args.accessToken,
      ...(args.refreshToken !== undefined ? { refreshToken: args.refreshToken } : {}),
      ...(args.expiresAt !== undefined ? { expiresAt: args.expiresAt } : {}),
    });
    return existing._id;
  },
});

type GithubCredentials = { clientId: string; clientSecret: string };

export async function exchangeGithubCode(code: string, credentials: GithubCredentials) {
  const tokenBody = await requestGithubToken({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    code,
  });
  const token = parseGithubTokenBody(tokenBody, Date.now());
  if (!token) {
    const error =
      tokenBody && typeof tokenBody === "object" && typeof (tokenBody as { error?: unknown }).error === "string"
        ? (tokenBody as { error: string }).error
        : "github_token_failed";
    throw new Error(`GitHub token exchange failed (${error})`);
  }
  const userResponse = await fetch("https://api.github.com/user", {
    headers: githubApiHeaders(token.accessToken),
  });
  if (!userResponse.ok) {
    throw new Error("Failed to load GitHub user");
  }
  const user = parseGithubUser(await readJson(userResponse));
  if (!user) {
    throw new Error("GitHub user id missing");
  }
  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt,
    providerUserId: user.id,
    login: user.login,
  };
}

export async function createGithubAppFromManifest(code: string) {
  const response = await fetch(
    `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "linear-clone",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  const body = await readJson(response);
  const created = response.ok ? parseManifestApp(body) : null;
  if (!created) {
    throw new Error("GitHub app registration failed");
  }
  return created;
}

async function refreshGithubAccessToken(credentials: GithubCredentials, refreshToken: string) {
  const body = await requestGithubToken({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return parseGithubTokenBody(body, Date.now());
}

async function persistRefreshedToken(
  ctx: Pick<ActionCtx, "runMutation">,
  session: {
    refreshToken: string | null;
    clientId: string | null;
    clientSecret: string | null;
  },
  workspaceId: Id<"workspaces">,
  userId: Id<"users">,
) {
  if (!session.refreshToken || !session.clientId || !session.clientSecret) return null;
  const next = await refreshGithubAccessToken(
    { clientId: session.clientId, clientSecret: session.clientSecret },
    session.refreshToken,
  );
  if (!next) return null;
  await ctx.runMutation(internal.github.updateTokensInternal, {
    workspaceId,
    userId,
    accessToken: next.accessToken,
    refreshToken: next.refreshToken ?? "",
    expiresAt: next.expiresAt ?? 0,
  });
  return next.accessToken;
}

function fetchPullRequest(
  pullRequest: { owner: string; repo: string; number: number },
  token: string,
) {
  return fetch(
    `https://api.github.com/repos/${pullRequest.owner}/${pullRequest.repo}/pulls/${pullRequest.number}`,
    { headers: githubApiHeaders(token) },
  );
}

function githubApiHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "linear-clone",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function requestGithubToken(body: Record<string, string>) {
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await readJson(tokenResponse);
  if (!tokenResponse.ok) {
    throw new Error("GitHub token exchange failed");
  }
  return payload;
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
