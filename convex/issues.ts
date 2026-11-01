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
import { assertAssignableCycle } from "./cycles";
import {
  assigneeLabel,
  dueDateLabel,
  priorityLabel,
  recordActivity,
  sameIdSet,
  statusLabel,
} from "./lib/activity";
import {
  cycleIdSchema,
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

const MAX_PARENT_DEPTH = 6;

async function issueIdentifier(ctx: ReadCtx, issue: Doc<"issues">) {
  const project = await ctx.db.get("projects", issue.projectId);
  return `${project?.key ?? "ISS"}-${issue.number}`;
}

async function assertParent(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
  issueId: Id<"issues"> | null,
  parentId: Id<"issues">,
) {
  if (issueId && parentId === issueId) {
    throw new Error("An issue cannot be its own parent");
  }
  const parent = await ctx.db.get("issues", parentId);
  if (!parent || parent.workspaceId !== workspaceId) {
    throw new Error("Parent issue is not in this workspace");
  }
  let cursor: Doc<"issues"> = parent;
  for (let depth = 0; depth < MAX_PARENT_DEPTH; depth += 1) {
    if (issueId && cursor._id === issueId) {
      throw new Error("That parent would create a cycle");
    }
    if (!cursor.parentId) return parent;
    const next = await ctx.db.get("issues", cursor.parentId);
    if (!next) return parent;
    cursor = next;
  }
  throw new Error("Sub-issue nesting is too deep");
}

async function subIssueStats(ctx: ReadCtx, issueId: Id<"issues">) {
  const children = await ctx.db
    .query("issues")
    .withIndex("by_parent", (q) => q.eq("parentId", issueId))
    .take(100);
  return {
    total: children.length,
    done: children.filter((child) => child.status === "done").length,
  };
}

async function enrichIssues(ctx: QueryCtx, issues: Doc<"issues">[]) {
  const users = new Map<string, Awaited<ReturnType<typeof loadPublicUser>>>();
  const labels = new Map<string, { _id: Id<"labels">; name: string; color: string } | null>();
  const projects = new Map<string, Doc<"projects"> | null>();
  const cycles = new Map<
    string,
    {
      _id: Id<"cycles">;
      number: number;
      status: Doc<"cycles">["status"];
      startsAt: number;
      endsAt: number;
    } | null
  >();

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

  async function cycleOf(cycleId: Id<"cycles"> | undefined) {
    if (!cycleId) return null;
    const cached = cycles.get(cycleId);
    if (cached !== undefined) return cached;
    const cycle = await ctx.db.get("cycles", cycleId);
    const value = cycle
      ? {
          _id: cycle._id,
          number: cycle.number,
          status: cycle.status,
          startsAt: cycle.startsAt,
          endsAt: cycle.endsAt,
        }
      : null;
    cycles.set(cycleId, value);
    return value;
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
      cycleId: issue.cycleId ?? null,
      cycle: await cycleOf(issue.cycleId),
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      identifier: `${project?.key ?? "ISS"}-${issue.number}`,
      projectName: project?.name ?? "Unknown",
      projectKey: project?.key ?? "ISS",
      assignee: await userOf(issue.assigneeId),
      creator: await userOf(issue.creatorId),
      labels: issueLabels,
      parentId: issue.parentId ?? null,
      parent: issue.parentId
        ? await (async () => {
            const parent = await ctx.db.get("issues", issue.parentId!);
            if (!parent) return null;
            const parentProject = await projectOf(parent.projectId);
            return {
              _id: parent._id,
              title: parent.title,
              identifier: `${parentProject?.key ?? "ISS"}-${parent.number}`,
            };
          })()
        : null,
      subIssues: await subIssueStats(ctx, issue._id),
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
    cycleId?: Id<"cycles">;
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
  if (args.cycleId && issue.cycleId !== args.cycleId) return false;
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
    cycleId: cycleIdSchema.optional(),
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
    } else if (args.cycleId) {
      const cycleId = args.cycleId;
      issues = await ctx.db
        .query("issues")
        .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
        .take(300);
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

export const mentions = zQuery({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
    const rows = await ctx.db
      .query("mentions")
      .withIndex("by_mentioned_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("mentionedUserId", userId),
      )
      .take(200);
    const latestByIssue = new Map<string, { issueId: Id<"issues">; createdAt: number }>();
    for (const row of rows) {
      if (row.authorId === userId) continue;
      const prev = latestByIssue.get(row.issueId);
      if (!prev || row.createdAt > prev.createdAt) {
        latestByIssue.set(row.issueId, { issueId: row.issueId, createdAt: row.createdAt });
      }
    }
    const issues: Doc<"issues">[] = [];
    for (const entry of latestByIssue.values()) {
      const issue = await ctx.db.get("issues", entry.issueId);
      if (issue && issue.workspaceId === args.workspaceId) {
        issues.push(issue);
      }
    }
    const enriched = await enrichIssues(ctx, issues);
    const mentionedAt = new Map(
      [...latestByIssue.values()].map((entry) => [entry.issueId, entry.createdAt]),
    );
    return enriched.sort(
      (a, b) => (mentionedAt.get(b._id) ?? 0) - (mentionedAt.get(a._id) ?? 0),
    );
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

export const children = zQuery({
  args: { issueId: issueIdSchema },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get("issues", args.issueId);
    if (!issue) return [];
    await requireWorkspaceMember(ctx, issue.workspaceId);
    const kids = await ctx.db
      .query("issues")
      .withIndex("by_parent", (q) => q.eq("parentId", issue._id))
      .take(100);
    const enriched = await enrichIssues(ctx, kids);
    return enriched.sort((a, b) => a.createdAt - b.createdAt);
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
    cycleId: cycleIdSchema.nullable().optional(),
    parentId: issueIdSchema.nullable().optional(),
  },
  handler: async (ctx, args) => {
    const { project, userId } = await requireProjectAccess(ctx, args.projectId);
    const assigneeId = args.assigneeId ?? undefined;
    await assertAssignee(ctx, project.workspaceId, assigneeId);
    const labelIds = args.labelIds ?? [];
    await assertLabels(ctx, project.workspaceId, labelIds);
    const cycleId = args.cycleId ?? undefined;
    await assertAssignableCycle(ctx, project.workspaceId, cycleId);
    const parentId = args.parentId ?? undefined;
    const parent = parentId
      ? await assertParent(ctx, project.workspaceId, null, parentId)
      : null;
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
      ...(cycleId ? { cycleId } : {}),
      ...(parentId ? { parentId } : {}),
    });
    await ctx.db.patch("projects", project._id, {
      issueCounter: number,
      updatedAt: now,
    });
    await recordActivity(ctx, {
      issueId,
      workspaceId: project.workspaceId,
      actorId: userId,
      type: "created",
    });
    if (parent) {
      const child = await ctx.db.get("issues", issueId);
      const childLabel = child ? await issueIdentifier(ctx, child) : args.title;
      const parentLabel = await issueIdentifier(ctx, parent);
      await recordActivity(ctx, {
        issueId,
        workspaceId: project.workspaceId,
        actorId: userId,
        type: "parent_set",
        toLabel: parentLabel,
      });
      await recordActivity(ctx, {
        issueId: parent._id,
        workspaceId: project.workspaceId,
        actorId: userId,
        type: "sub_issue_added",
        toLabel: childLabel,
      });
    }
    return issueId;
  },
});

export const setParent = zMutation({
  args: {
    issueId: issueIdSchema,
    parentId: issueIdSchema.nullable(),
  },
  handler: async (ctx, args) => {
    const { issue, userId } = await requireIssueAccess(ctx, args.issueId);
    const nextParentId = args.parentId ?? undefined;
    if (nextParentId === issue.parentId) return issue._id;
    const nextParent = nextParentId
      ? await assertParent(ctx, issue.workspaceId, issue._id, nextParentId)
      : null;
    const childLabel = await issueIdentifier(ctx, issue);
    if (issue.parentId) {
      const previous = await ctx.db.get("issues", issue.parentId);
      const previousLabel = previous ? await issueIdentifier(ctx, previous) : undefined;
      await recordActivity(ctx, {
        issueId: issue._id,
        workspaceId: issue.workspaceId,
        actorId: userId,
        type: "parent_cleared",
        ...(previousLabel ? { fromLabel: previousLabel } : {}),
      });
      if (previous) {
        await recordActivity(ctx, {
          issueId: previous._id,
          workspaceId: issue.workspaceId,
          actorId: userId,
          type: "sub_issue_removed",
          fromLabel: childLabel,
        });
      }
    }
    if (nextParent) {
      await recordActivity(ctx, {
        issueId: issue._id,
        workspaceId: issue.workspaceId,
        actorId: userId,
        type: "parent_set",
        toLabel: await issueIdentifier(ctx, nextParent),
      });
      await recordActivity(ctx, {
        issueId: nextParent._id,
        workspaceId: issue.workspaceId,
        actorId: userId,
        type: "sub_issue_added",
        toLabel: childLabel,
      });
    }
    await ctx.db.patch("issues", issue._id, {
      parentId: nextParentId,
      updatedAt: Date.now(),
    });
    return issue._id;
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
    cycleId: cycleIdSchema.nullable().optional(),
    projectId: projectIdSchema.optional(),
    order: z.number().finite().optional(),
  },
  handler: async (ctx, args) => {
    const { issue, userId } = await requireIssueAccess(ctx, args.issueId);
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
    if (args.cycleId !== undefined) {
      await assertAssignableCycle(ctx, workspaceId, args.cycleId, {
        allowCompletedIfCurrent: issue.cycleId,
      });
    }
    const title = args.title ?? issue.title;
    const description = args.description ?? issue.description;

    if (args.title !== undefined && args.title !== issue.title) {
      await recordActivity(ctx, {
        issueId: issue._id,
        workspaceId: issue.workspaceId,
        actorId: userId,
        type: "title_changed",
        fromLabel: issue.title,
        toLabel: args.title,
      });
    }
    if (args.description !== undefined && args.description !== issue.description) {
      await recordActivity(ctx, {
        issueId: issue._id,
        workspaceId: issue.workspaceId,
        actorId: userId,
        type: "description_changed",
      });
    }
    if (args.status !== undefined && args.status !== issue.status) {
      await recordActivity(ctx, {
        issueId: issue._id,
        workspaceId: issue.workspaceId,
        actorId: userId,
        type: "status_changed",
        fromLabel: statusLabel(issue.status),
        toLabel: statusLabel(args.status),
      });
    }
    if (args.priority !== undefined && args.priority !== issue.priority) {
      await recordActivity(ctx, {
        issueId: issue._id,
        workspaceId: issue.workspaceId,
        actorId: userId,
        type: "priority_changed",
        fromLabel: priorityLabel(issue.priority),
        toLabel: priorityLabel(args.priority),
      });
    }
    if (args.assigneeId !== undefined) {
      const nextAssigneeId = args.assigneeId ?? undefined;
      if (nextAssigneeId !== issue.assigneeId) {
        await recordActivity(ctx, {
          issueId: issue._id,
          workspaceId: issue.workspaceId,
          actorId: userId,
          type: "assignee_changed",
          fromLabel: await assigneeLabel(ctx, issue.assigneeId),
          toLabel: await assigneeLabel(ctx, nextAssigneeId),
        });
      }
    }
    if (args.dueDate !== undefined) {
      const nextDue = args.dueDate ?? undefined;
      if (nextDue !== issue.dueDate) {
        if (issue.dueDate === undefined && nextDue !== undefined) {
          await recordActivity(ctx, {
            issueId: issue._id,
            workspaceId: issue.workspaceId,
            actorId: userId,
            type: "due_date_set",
            toLabel: dueDateLabel(nextDue),
          });
        } else if (nextDue === undefined) {
          await recordActivity(ctx, {
            issueId: issue._id,
            workspaceId: issue.workspaceId,
            actorId: userId,
            type: "due_date_cleared",
            fromLabel: dueDateLabel(issue.dueDate),
          });
        } else {
          await recordActivity(ctx, {
            issueId: issue._id,
            workspaceId: issue.workspaceId,
            actorId: userId,
            type: "due_date_changed",
            fromLabel: dueDateLabel(issue.dueDate),
            toLabel: dueDateLabel(nextDue),
          });
        }
      }
    }
    if (args.labelIds !== undefined && !sameIdSet(args.labelIds, issue.labelIds)) {
      const prev = new Set(issue.labelIds);
      const next = new Set(args.labelIds);
      const addedIds = args.labelIds.filter((id) => !prev.has(id));
      const removedIds = issue.labelIds.filter((id) => !next.has(id));
      if (addedIds.length > 0) {
        const names = [];
        for (const labelId of addedIds) {
          const label = await ctx.db.get("labels", labelId);
          if (label) names.push(label.name);
        }
        if (names.length > 0) {
          await recordActivity(ctx, {
            issueId: issue._id,
            workspaceId: issue.workspaceId,
            actorId: userId,
            type: "labels_added",
            toLabel: names.join(", "),
          });
        }
      }
      if (removedIds.length > 0) {
        const names = [];
        for (const labelId of removedIds) {
          const label = await ctx.db.get("labels", labelId);
          if (label) names.push(label.name);
        }
        if (names.length > 0) {
          await recordActivity(ctx, {
            issueId: issue._id,
            workspaceId: issue.workspaceId,
            actorId: userId,
            type: "labels_removed",
            fromLabel: names.join(", "),
          });
        }
      }
    }

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
      ...(args.cycleId !== undefined ? { cycleId: args.cycleId ?? undefined } : {}),
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
    const { issue, userId } = await requireIssueAccess(ctx, args.issueId);
    for (let pass = 0; pass < 10; pass += 1) {
      const comments = await ctx.db
        .query("comments")
        .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
        .take(50);
      for (const comment of comments) {
        for (let mentionPass = 0; mentionPass < 10; mentionPass += 1) {
          const mentionRows = await ctx.db
            .query("mentions")
            .withIndex("by_comment", (q) => q.eq("commentId", comment._id))
            .take(50);
          for (const row of mentionRows) {
            await ctx.db.delete("mentions", row._id);
          }
          if (mentionRows.length < 50) break;
        }
        await ctx.db.delete("comments", comment._id);
      }
      if (comments.length < 50) break;
    }
    for (let pass = 0; pass < 10; pass += 1) {
      const pullRequests = await ctx.db
        .query("pullRequests")
        .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
        .take(50);
      for (const pullRequest of pullRequests) {
        await ctx.db.delete("pullRequests", pullRequest._id);
      }
      if (pullRequests.length < 50) break;
    }
    const childrenOf = await ctx.db
      .query("issues")
      .withIndex("by_parent", (q) => q.eq("parentId", issue._id))
      .take(100);
    for (const child of childrenOf) {
      await ctx.db.patch("issues", child._id, { parentId: undefined, updatedAt: Date.now() });
    }
    if (issue.parentId) {
      const parent = await ctx.db.get("issues", issue.parentId);
      if (parent) {
        await recordActivity(ctx, {
          issueId: parent._id,
          workspaceId: issue.workspaceId,
          actorId: userId,
          type: "sub_issue_removed",
          fromLabel: await issueIdentifier(ctx, issue),
        });
      }
    }
    await ctx.db.delete("issues", issue._id);
    return issue._id;
  },
});
