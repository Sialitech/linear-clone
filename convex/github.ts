import { getAuthUserId } from "@convex-dev/auth/server";
import { z } from "zod";
import {
  assertCanManage,
  requireIssueAccess,
  requireProjectAccess,
  requireUser,
  requireWorkspaceMember,
} from "./lib/access";
import {
  issueIdSchema,
  projectIdSchema,
  pullRequestIdSchema,
  workspaceIdSchema,
  zMutation,
  zQuery,
} from "./lib/functions";
import {
  isGitHubOAuthConfigured,
  parsePullRequestUrl,
  parseRepoFullName,
  publicConnection,
} from "./lib/github";

export const oauthStatus = zQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const configured = isGitHubOAuthConfigured();
    if (!userId) {
      return { configured, connected: false, login: null, githubUserId: null };
    }
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return {
      configured,
      ...publicConnection(connection),
    };
  },
});

export const listProjectRepos = zQuery({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(100);
    const repos = await ctx.db
      .query("projectRepos")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(100);
    const byProject = new Map(repos.map((repo) => [repo.projectId, repo]));
    return projects.map((project) => {
      const repo = byProject.get(project._id);
      return {
        projectId: project._id,
        projectName: project.name,
        projectKey: project.key,
        repo: repo
          ? {
              _id: repo._id,
              owner: repo.owner,
              name: repo.name,
              fullName: `${repo.owner}/${repo.name}`,
              updatedAt: repo.updatedAt,
            }
          : null,
      };
    });
  },
});

export const getProjectRepo = zQuery({
  args: { projectId: projectIdSchema },
  handler: async (ctx, args) => {
    const { project } = await requireProjectAccess(ctx, args.projectId);
    const repo = await ctx.db
      .query("projectRepos")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .unique();
    if (!repo) return null;
    return {
      _id: repo._id,
      projectId: repo.projectId,
      owner: repo.owner,
      name: repo.name,
      fullName: `${repo.owner}/${repo.name}`,
      updatedAt: repo.updatedAt,
    };
  },
});

export const saveProjectRepo = zMutation({
  args: {
    projectId: projectIdSchema,
    fullName: z.string().trim().min(3).max(200),
  },
  handler: async (ctx, args) => {
    const { project, membership } = await requireProjectAccess(ctx, args.projectId);
    assertCanManage(membership);
    const { owner, name } = parseRepoFullName(args.fullName);
    const now = Date.now();
    const existing = await ctx.db
      .query("projectRepos")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .unique();
    if (existing) {
      await ctx.db.patch("projectRepos", existing._id, {
        owner,
        name,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("projectRepos", {
      projectId: project._id,
      workspaceId: project.workspaceId,
      owner,
      name,
      createdAt: now,
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
    return project._id;
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
    return rows.map((row) => ({
      _id: row._id,
      issueId: row.issueId,
      owner: row.owner,
      repo: row.repo,
      number: row.number,
      url: row.url,
      title: row.title ?? null,
      state: row.state ?? null,
      linkedById: row.linkedById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  },
});

export const linkPullRequest = zMutation({
  args: {
    issueId: issueIdSchema,
    url: z.string().trim().url().max(500),
  },
  handler: async (ctx, args) => {
    const { issue, userId } = await requireIssueAccess(ctx, args.issueId);
    const parsed = parsePullRequestUrl(args.url);
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
    const now = Date.now();
    return await ctx.db.insert("pullRequests", {
      issueId: issue._id,
      workspaceId: issue.workspaceId,
      owner: parsed.owner,
      repo: parsed.repo,
      number: parsed.number,
      url: parsed.url,
      linkedById: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const unlinkPullRequest = zMutation({
  args: { pullRequestId: pullRequestIdSchema },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("pullRequests", args.pullRequestId);
    if (!row) {
      throw new Error("Pull request link not found");
    }
    await requireWorkspaceMember(ctx, row.workspaceId);
    await ctx.db.delete("pullRequests", row._id);
    return row._id;
  },
});

export const disconnectGithub = zMutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (connection) {
      await ctx.db.delete("githubConnections", connection._id);
    }
    return null;
  },
});
