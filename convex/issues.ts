import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { z } from "zod";
import {
  loadPublicUser,
  requireIssueAccess,
  requireProjectAccess,
  requireWorkspaceMember,
  type ReadCtx,
} from "./lib/access";
import {
  issueIdSchema,
  issueStatusSchema,
  labelIdSchema,
  prioritySchema,
  projectIdSchema,
  userIdSchema,
  workspaceIdSchema,
  zMutation,
  zQuery,
} from "./lib/functions";
import { toSearchText } from "./lib/keys";

const labelIdsSchema = z.array(labelIdSchema).max(12);

async function assertAssignee(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
  assigneeId: Id<"users"> | null | undefined,
) {
  if (!assigneeId) return;
  const membership = await ctx.db
    .query("members")
    .withIndex("by_workspace_and_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", assigneeId),
    )
    .unique();
  if (!membership) {
    throw new Error("Assignee is not a member of this workspace");
  }
}

async function assertLabels(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
  labelIds: Id<"labels">[],
) {
  for (const labelId of labelIds) {
    const label = await ctx.db.get("labels", labelId);
    if (!label || label.workspaceId !== workspaceId) {
      throw new Error("Label is not in this workspace");
    }
  }
}

async function enrichIssues(ctx: QueryCtx, issues: Doc<"issues">[]) {
  const users = new Map<string, Awaited<ReturnType<typeof loadPublicUser>>>();
  const labels = new Map<string, { _id: Id<"labels">; name: string; color: string } | null>();
  const projects = new Map<string, Doc<"projects"> | null>();

  async function userOf(userId: Id<"users"> | undefined) {
    if (!userId) return null;
    const cached = users.get(userId);
    if (cached !== undefined) return cached;
    const user = await loadPublicUser(ctx, userId);
    users.set(userId, user);
    return user;
  }

  async function labelOf(labelId: Id<"labels">) {
    const cached = labels.get(labelId);
    if (cached !== undefined) return cached;
    const label = await ctx.db.get("labels", labelId);
    const value = label
      ? { _id: label._id, name: label.name, color: label.color }
      : null;
    labels.set(labelId, value);
    return value;
  }

  async function projectOf(projectId: Id<"projects">) {
    const cached = projects.get(projectId);
    if (cached !== undefined) return cached;
    const project = await ctx.db.get("projects", projectId);
    projects.set(projectId, project);
    return project;
  }

  const enriched = [];
  for (const issue of issues) {
    const project = await projectOf(issue.projectId);
    const issueLabels = [];
    for (const labelId of issue.labelIds) {
      const label = await labelOf(labelId);
      if (label) issueLabels.push(label);
    }
    enriched.push({
      _id: issue._id,
      title: issue.title,
      description: issue.description,
      projectId: issue.projectId,
      workspaceId: issue.workspaceId,
      status: issue.status,
      priority: issue.priority,
      order: issue.order,
      number: issue.number,
      dueDate: issue.dueDate ?? null,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      identifier: `${project?.key ?? "ISS"}-${issue.number}`,
      projectName: project?.name ?? "Unknown",
      projectKey: project?.key ?? "ISS",
      assignee: await userOf(issue.assigneeId),
      creator: await userOf(issue.creatorId),
      labels: issueLabels,
    });
  }
  return enriched;
}

function matchesFilters(
  issue: Doc<"issues">,
  args: {
    workspaceId: Id<"workspaces">;
    projectId?: Id<"projects">;
    status?: Doc<"issues">["status"];
    priority?: Doc<"issues">["priority"];
    assigneeId?: Id<"users">;
    labelId?: Id<"labels">;
    unassigned?: boolean;
  },
) {
  if (issue.workspaceId !== args.workspaceId) return false;
  if (args.projectId && issue.projectId !== args.projectId) return false;
  if (args.status && issue.status !== args.status) return false;
  if (args.priority && issue.priority !== args.priority) return false;
  if (args.assigneeId && issue.assigneeId !== args.assigneeId) return false;
  if (args.unassigned && issue.assigneeId !== undefined) return false;
  if (args.labelId && !issue.labelIds.includes(args.labelId)) return false;
  return true;
}

export const list = zQuery({
  args: {
    workspaceId: workspaceIdSchema,
    projectId: projectIdSchema.optional(),
    status: issueStatusSchema.optional(),
    priority: prioritySchema.optional(),
    assigneeId: userIdSchema.optional(),
    labelId: labelIdSchema.optional(),
    search: z.string().trim().max(200).optional(),
    unassigned: z.boolean().optional(),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);
    const search = args.search?.trim();
    let issues: Doc<"issues">[];

    if (search) {
      const projectId = args.projectId;
      issues = await ctx.db
        .query("issues")
        .withSearchIndex("search_text", (q) => {
          const searched = q.search("searchText", search).eq("workspaceId", args.workspaceId);
          return projectId ? searched.eq("projectId", projectId) : searched;
        })
        .take(100);
    } else if (args.projectId && args.status) {
      const projectId = args.projectId;
      const status = args.status;
      issues = await ctx.db
        .query("issues")
        .withIndex("by_project_and_status", (q) =>
          q.eq("projectId", projectId).eq("status", status),
        )
        .take(200);
    } else if (args.projectId) {
      const projectId = args.projectId;
      issues = await ctx.db
        .query("issues")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .take(300);
    } else if (args.assigneeId) {
      const assigneeId = args.assigneeId;
      issues = await ctx.db
        .query("issues")
        .withIndex("by_assignee", (q) => q.eq("assigneeId", assigneeId))
        .take(200);
    } else if (args.status) {
      const status = args.status;
      issues = await ctx.db
        .query("issues")
        .withIndex("by_workspace_and_status", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("status", status),
        )
        .take(200);
    } else {
      issues = await ctx.db
        .query("issues")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .take(200);
    }

    const filtered = issues.filter((issue) => matchesFilters(issue, args));
    return await enrichIssues(ctx, filtered);
  },
});

export const inbox = zQuery({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
    const issues = await ctx.db
      .query("issues")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", userId))
      .take(200);
    const open = issues.filter(
      (issue) => issue.workspaceId === args.workspaceId && issue.status !== "done",
    );
    const enriched = await enrichIssues(ctx, open);
    return enriched.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const get = zQuery({
  args: { issueId: issueIdSchema },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get("issues", args.issueId);
    if (!issue) return null;
    await requireWorkspaceMember(ctx, issue.workspaceId);
    const [enriched] = await enrichIssues(ctx, [issue]);
    return enriched ?? null;
  },
});

export const create = zMutation({
  args: {
    projectId: projectIdSchema,
    title: z.string().trim().min(1).max(180),
    description: z.string().max(20000).optional(),
    status: issueStatusSchema.optional(),
    priority: prioritySchema.optional(),
    assigneeId: userIdSchema.nullable().optional(),
    labelIds: labelIdsSchema.optional(),
    dueDate: z.number().finite().nullable().optional(),
  },
  handler: async (ctx, args) => {
    const { project, userId } = await requireProjectAccess(ctx, args.projectId);
    const assigneeId = args.assigneeId ?? undefined;
    await assertAssignee(ctx, project.workspaceId, assigneeId);
    const labelIds = args.labelIds ?? [];
    await assertLabels(ctx, project.workspaceId, labelIds);
    const number = project.issueCounter + 1;
    const now = Date.now();
    const description = args.description?.trim() ?? "";
    const issueId = await ctx.db.insert("issues", {
      title: args.title,
      description,
      searchText: toSearchText(args.title, description),
      projectId: project._id,
      workspaceId: project.workspaceId,
      creatorId: userId,
      status: args.status ?? "todo",
      priority: args.priority ?? "none",
      labelIds,
      order: now,
      number,
      createdAt: now,
      updatedAt: now,
      ...(assigneeId ? { assigneeId } : {}),
      ...(args.dueDate ? { dueDate: args.dueDate } : {}),
    });
    await ctx.db.patch("projects", project._id, {
      issueCounter: number,
      updatedAt: now,
    });
    return issueId;
  },
});

export const update = zMutation({
  args: {
    issueId: issueIdSchema,
    title: z.string().trim().min(1).max(180).optional(),
    description: z.string().max(20000).optional(),
    status: issueStatusSchema.optional(),
    priority: prioritySchema.optional(),
    assigneeId: userIdSchema.nullable().optional(),
    labelIds: labelIdsSchema.optional(),
    dueDate: z.number().finite().nullable().optional(),
    projectId: projectIdSchema.optional(),
    order: z.number().finite().optional(),
  },
  handler: async (ctx, args) => {
    const { issue } = await requireIssueAccess(ctx, args.issueId);
    let projectId = issue.projectId;
    let workspaceId = issue.workspaceId;
    if (args.projectId && args.projectId !== issue.projectId) {
      const next = await ctx.db.get("projects", args.projectId);
      if (!next || next.workspaceId !== issue.workspaceId) {
        throw new Error("Project is not in this workspace");
      }
      projectId = next._id;
      workspaceId = next.workspaceId;
    }
    if (args.assigneeId !== undefined) {
      await assertAssignee(ctx, workspaceId, args.assigneeId);
    }
    if (args.labelIds) {
      await assertLabels(ctx, workspaceId, args.labelIds);
    }
    const title = args.title ?? issue.title;
    const description = args.description ?? issue.description;
    await ctx.db.patch("issues", issue._id, {
      title,
      description,
      searchText: toSearchText(title, description),
      projectId,
      workspaceId,
      updatedAt: Date.now(),
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.priority !== undefined ? { priority: args.priority } : {}),
      ...(args.labelIds !== undefined ? { labelIds: args.labelIds } : {}),
      ...(args.order !== undefined ? { order: args.order } : {}),
      ...(args.assigneeId !== undefined
        ? { assigneeId: args.assigneeId ?? undefined }
        : {}),
      ...(args.dueDate !== undefined ? { dueDate: args.dueDate ?? undefined } : {}),
    });
    return issue._id;
  },
});

export const move = zMutation({
  args: {
    issueId: issueIdSchema,
    workspaceId: workspaceIdSchema,
    projectId: projectIdSchema,
    status: issueStatusSchema,
    order: z.number().finite(),
  },
  handler: async (ctx, args) => {
    const { issue } = await requireIssueAccess(ctx, args.issueId);
    if (issue.workspaceId !== args.workspaceId || issue.projectId !== args.projectId) {
      throw new Error("Issue does not belong to that project");
    }
    await ctx.db.patch("issues", issue._id, {
      status: args.status,
      order: args.order,
      updatedAt: Date.now(),
    });
    return issue._id;
  },
});

export const remove = zMutation({
  args: { issueId: issueIdSchema },
  handler: async (ctx, args) => {
    const { issue } = await requireIssueAccess(ctx, args.issueId);
    for (let pass = 0; pass < 10; pass += 1) {
      const comments = await ctx.db
        .query("comments")
        .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
        .take(50);
      for (const comment of comments) {
        await ctx.db.delete("comments", comment._id);
      }
      if (comments.length < 50) break;
    }
    await ctx.db.delete("issues", issue._id);
    return issue._id;
  },
});
