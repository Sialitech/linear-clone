import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { hashApiToken } from "./apiTokens";
import {
  createComment,
  listComments,
  removeComment,
  updateComment,
} from "./comments";
import { createIssue, getIssue, listIssues, listTriage, triageIssue, updateIssue } from "./issues";
import { setMcpActor } from "./lib/access";
import { storeMarkdownImages } from "./lib/attachments";
import type { IncomingImage } from "./lib/materializeImages";
import { ISSUE_STATUSES, TRIAGE_ACTIONS, WORKFLOW_STATUSES } from "./model";
import { toolResult } from "./mcpProtocol";

const STATUSES = new Set<string>(ISSUE_STATUSES);
const WORKFLOW = new Set<string>(WORKFLOW_STATUSES);
const TRIAGE = new Set<string>(TRIAGE_ACTIONS);
const PRIORITIES = new Set(["urgent", "high", "medium", "low", "none"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function incomingImages(value: unknown): IncomingImage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("images must be an array");
  if (value.length > 4) throw new Error("At most 4 images");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid image");
    const record = item as Record<string, unknown>;
    const name = text(record.name) || "image";
    const contentType = text(record.contentType);
    const data = typeof record.data === "string" ? record.data : "";
    if (!contentType.startsWith("image/") || !data) throw new Error("Each image needs contentType and base64 data");
    return { name, contentType, data };
  });
}

async function memberOrThrow(
  ctx: { db: { get: Function; query: Function } },
  workspaceId: Id<"workspaces">,
  userId: Id<"users">,
) {
  const user = await ctx.db.get("users", userId);
  const workspace = await ctx.db.get("workspaces", workspaceId);
  if (!user || !workspace) throw new Error("Token is no longer valid");
  return { user, workspace };
}

async function safeGet<Table extends "projects" | "issues">(
  ctx: { db: { get: (table: Table, id: Id<Table>) => Promise<Doc<Table> | null> } },
  table: Table,
  id: string,
) {
  try {
    return await ctx.db.get(table, id as Id<Table>);
  } catch {
    return null;
  }
}

async function resolveProject(
  ctx: { db: { get: Function; query: Function } },
  workspaceId: Id<"workspaces">,
  project: string,
) {
  const byId = await safeGet(ctx as never, "projects", project);
  if (byId && byId.workspaceId === workspaceId) return byId;
  const byKey = await ctx.db
    .query("projects")
    .withIndex("by_workspace_and_key", (q: { eq: Function }) =>
      q.eq("workspaceId", workspaceId).eq("key", project.toUpperCase()),
    )
    .unique();
  if (!byKey) throw new Error(`Project not found: ${project}`);
  return byKey as Doc<"projects">;
}

async function resolveIssue(
  ctx: { db: { get: Function; query: Function } },
  workspaceId: Id<"workspaces">,
  id: string,
) {
  const direct = await safeGet(ctx as never, "issues", id);
  if (direct && direct.workspaceId === workspaceId) return direct;
  const match = /^([A-Za-z][A-Za-z0-9]+)-(\d+)$/.exec(id.trim());
  if (!match) throw new Error(`Issue not found: ${id}`);
  const project = await resolveProject(ctx, workspaceId, match[1]!);
  const number = Number(match[2]);
  const issues = await ctx.db
    .query("issues")
    .withIndex("by_project", (q: { eq: Function }) => q.eq("projectId", project._id))
    .take(500);
  const issue = (issues as Doc<"issues">[]).find((row) => row.number === number);
  if (!issue) throw new Error(`Issue not found: ${id}`);
  return issue;
}

function parseDueDate(value: unknown, field = "dueDate"): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be YYYY-MM-DD or null`);
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) throw new Error(`${field} is not a valid date`);
  return parsed;
}

export const authenticate = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("apiTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    return Boolean(token);
  },
});

export const dispatch = internalMutation({
  args: {
    tokenHash: v.string(),
    name: v.string(),
    arguments: v.any(),
  },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("apiTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!token) throw new Error("Unauthorized");
    await ctx.db.patch("apiTokens", token._id, { lastUsedAt: Date.now() });
    const workspaceId = token.workspaceId;
    const actorId = token.userId;
    setMcpActor(actorId);
    try {
      const input = (args.arguments ?? {}) as Record<string, unknown>;
      switch (args.name) {
        case "whoami": {
          const { user, workspace } = await memberOrThrow(ctx, workspaceId, actorId);
          return toolResult(
            asJson({
              user: { id: user._id, name: user.name ?? null, email: user.email ?? null },
              workspace: { id: workspace._id, name: workspace.name, slug: workspace.slug },
            }),
          );
        }
        case "list_projects": {
          const projects = await ctx.db
            .query("projects")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
            .take(100);
          return toolResult(
            asJson(
              projects.map((project) => ({
                id: project._id,
                name: project.name,
                key: project.key,
                status: project.status,
                description: project.description,
              })),
            ),
          );
        }
        case "list_users": {
          const memberships = await ctx.db
            .query("members")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
            .take(200);
          const users = [];
          for (const membership of memberships) {
            const user = await ctx.db.get("users", membership.userId);
            if (!user) continue;
            users.push({
              id: user._id,
              name: user.name ?? null,
              email: user.email ?? null,
              role: membership.role,
              isMe: user._id === actorId,
            });
          }
          return toolResult(asJson(users));
        }
        case "list_labels": {
          const labels = await ctx.db
            .query("labels")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
            .take(100);
          return toolResult(
            asJson(labels.map((label) => ({ id: label._id, name: label.name, color: label.color }))),
          );
        }
        case "list_cycles": {
          const status = text(input.status);
          if (status && !["upcoming", "active", "completed"].includes(status)) {
            throw new Error(`Unknown cycle status: ${status}`);
          }
          const cycles = status
            ? await ctx.db
                .query("cycles")
                .withIndex("by_workspace_and_status", (q) =>
                  q.eq("workspaceId", workspaceId).eq("status", status as Doc<"cycles">["status"]),
                )
                .take(100)
            : await ctx.db
                .query("cycles")
                .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
                .take(100);
          return toolResult(
            asJson(
              cycles.map((cycle) => ({
                id: cycle._id,
                number: cycle.number,
                status: cycle.status,
                startsAt: cycle.startsAt,
                endsAt: cycle.endsAt,
              })),
            ),
          );
        }
        case "list_issue_statuses":
          return toolResult(asJson([...ISSUE_STATUSES]));
        case "list_issues": {
          const projectRef = text(input.project);
          const project = projectRef ? await resolveProject(ctx, workspaceId, projectRef) : null;
          const assigneeRef = text(input.assignee);
          const assigneeId = assigneeRef
            ? assigneeRef === "me"
              ? actorId
              : (assigneeRef as Id<"users">)
            : undefined;
          const status = text(input.status);
          const priority = text(input.priority);
          if (status && !STATUSES.has(status)) throw new Error(`Unknown status: ${status}`);
          if (priority && !PRIORITIES.has(priority)) throw new Error(`Unknown priority: ${priority}`);
          const issues = await listIssues(ctx, {
            workspaceId,
            ...(project ? { projectId: project._id } : {}),
            ...(status ? { status: status as Doc<"issues">["status"] } : {}),
            ...(priority ? { priority: priority as Doc<"issues">["priority"] } : {}),
            ...(assigneeId ? { assigneeId } : {}),
            ...(text(input.label) ? { labelId: text(input.label) as Id<"labels"> } : {}),
            ...(text(input.cycle) ? { cycleId: text(input.cycle) as Id<"cycles"> } : {}),
            ...(text(input.query) ? { search: text(input.query) } : {}),
            ...(input.unassigned === true ? { unassigned: true } : {}),
          });
          const limit = typeof input.limit === "number" ? Math.min(50, Math.max(1, input.limit)) : 25;
          return toolResult(
            asJson(
              issues.slice(0, limit).map((issue) => ({
                id: issue._id,
                identifier: issue.identifier,
                title: issue.title,
                status: issue.status,
                priority: issue.priority,
                project: { id: issue.projectId, key: issue.projectKey, name: issue.projectName },
                assignee: issue.assignee,
              })),
            ),
          );
        }
        case "get_issue": {
          const issue = await resolveIssue(ctx, workspaceId, text(input.id));
          const detailed = await getIssue(ctx, issue._id);
          const comments = await listComments(ctx, issue._id);
          return toolResult(asJson({ ...detailed, comments }));
        }
        case "save_issue": {
          const id = text(input.id);
          const assignee =
            input.assignee === null
              ? null
              : input.assignee === undefined
                ? undefined
                : text(input.assignee) === "me"
                  ? actorId
                  : (text(input.assignee) as Id<"users">);
          const dueDate = parseDueDate(input.dueDate);
          if (!id) {
            const projectRef = text(input.project);
            const title = text(input.title);
            if (!projectRef || !title) throw new Error("Creating an issue requires project and title");
            const project = await resolveProject(ctx, workspaceId, projectRef);
            const parentRef = input.parent === null ? null : text(input.parent);
            const parent = parentRef ? await resolveIssue(ctx, workspaceId, parentRef) : null;
            const images = incomingImages(input.images);
            const description = await storeMarkdownImages(ctx, {
              workspaceId,
              userId: actorId,
              text: typeof input.description === "string" ? input.description : "",
              images,
            });
            const issueId = await createIssue(ctx, {
              projectId: project._id,
              title,
              ...(description ? { description } : {}),
              ...(text(input.status) ? { status: text(input.status) as Doc<"issues">["status"] } : {}),
              ...(text(input.priority)
                ? { priority: text(input.priority) as Doc<"issues">["priority"] }
                : {}),
              ...(assignee !== undefined ? { assigneeId: assignee } : {}),
              ...(Array.isArray(input.labelIds)
                ? { labelIds: input.labelIds.filter((item) => typeof item === "string") as Id<"labels">[] }
                : {}),
              ...(dueDate !== undefined ? { dueDate } : {}),
              ...(input.cycle === null
                ? { cycleId: null }
                : text(input.cycle)
                  ? { cycleId: text(input.cycle) as Id<"cycles"> }
                  : {}),
              ...(parent ? { parentId: parent._id } : {}),
            });
            const created = await getIssue(ctx, issueId);
            return toolResult(asJson(created));
          }
          const issue = await resolveIssue(ctx, workspaceId, id);
          const images = incomingImages(input.images);
          const description =
            typeof input.description === "string" || images.length > 0
              ? await storeMarkdownImages(ctx, {
                  workspaceId,
                  userId: actorId,
                  text: typeof input.description === "string" ? input.description : issue.description,
                  images,
                })
              : undefined;
          const projectRef = text(input.project);
          const project = projectRef ? await resolveProject(ctx, workspaceId, projectRef) : null;
          await updateIssue(ctx, {
            issueId: issue._id,
            ...(text(input.title) ? { title: text(input.title) } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(text(input.status) ? { status: text(input.status) as Doc<"issues">["status"] } : {}),
            ...(text(input.priority)
              ? { priority: text(input.priority) as Doc<"issues">["priority"] }
              : {}),
            ...(assignee !== undefined ? { assigneeId: assignee } : {}),
            ...(Array.isArray(input.labelIds)
              ? { labelIds: input.labelIds.filter((item) => typeof item === "string") as Id<"labels">[] }
              : {}),
            ...(dueDate !== undefined ? { dueDate } : {}),
            ...(input.cycle === null
              ? { cycleId: null }
              : text(input.cycle)
                ? { cycleId: text(input.cycle) as Id<"cycles"> }
                : {}),
            ...(project ? { projectId: project._id } : {}),
          });
          const updated = await getIssue(ctx, issue._id);
          return toolResult(asJson(updated));
        }
        case "list_triage": {
          const projectRef = text(input.project);
          const project = projectRef ? await resolveProject(ctx, workspaceId, projectRef) : null;
          const queue = await listTriage(ctx, {
            workspaceId,
            ...(project ? { projectId: project._id } : {}),
          });
          const includeSnoozed = input.includeSnoozed === true;
          const rows = includeSnoozed ? [...queue.waiting, ...queue.snoozed] : queue.waiting;
          const limit = typeof input.limit === "number" ? Math.min(50, Math.max(1, input.limit)) : 25;
          return toolResult(
            asJson({
              waiting: queue.waiting.length,
              snoozed: queue.snoozed.length,
              issues: rows.slice(0, limit).map((issue) => ({
                id: issue._id,
                identifier: issue.identifier,
                title: issue.title,
                status: issue.status,
                priority: issue.priority,
                project: { id: issue.projectId, key: issue.projectKey, name: issue.projectName },
                snoozedUntil: issue.snoozedUntil,
                createdAt: issue.createdAt,
              })),
            }),
          );
        }
        case "triage_issue": {
          const action = text(input.action);
          if (!TRIAGE.has(action)) throw new Error(`Unknown triage action: ${action || "(empty)"}`);
          const issue = await resolveIssue(ctx, workspaceId, text(input.id));
          const status = text(input.status);
          if (status && !WORKFLOW.has(status)) throw new Error(`Unknown status: ${status}`);
          const snoozedUntil = action === "snooze" ? parseDueDate(input.snoozeUntil, "snoozeUntil") : undefined;
          if (action === "snooze" && typeof snoozedUntil !== "number") {
            throw new Error("snoozeUntil must be YYYY-MM-DD");
          }
          await triageIssue(ctx, {
            issueId: issue._id,
            action: action as (typeof TRIAGE_ACTIONS)[number],
            ...(status && action === "accept"
              ? { status: status as (typeof WORKFLOW_STATUSES)[number] }
              : {}),
            ...(typeof snoozedUntil === "number" ? { snoozedUntil } : {}),
          });
          return toolResult(asJson(await getIssue(ctx, issue._id)));
        }
        case "list_comments": {
          const issue = await resolveIssue(ctx, workspaceId, text(input.issue));
          return toolResult(asJson(await listComments(ctx, issue._id)));
        }
        case "save_comment": {
          const images = incomingImages(input.images);
          const commentId = text(input.id);
          let raw = typeof input.body === "string" ? input.body : "";
          if (commentId && typeof input.body !== "string") {
            const existing = await ctx.db.get("comments", commentId as Id<"comments">);
            raw = existing?.content ?? "";
          }
          const body = (await storeMarkdownImages(ctx, {
            workspaceId,
            userId: actorId,
            text: raw,
            images,
          })).trim();
          if (!body) throw new Error("Comment body is required");
          if (commentId) {
            const id = await updateComment(ctx, { commentId: commentId as Id<"comments">, content: body });
            return toolResult(asJson({ id }));
          }
          const issue = await resolveIssue(ctx, workspaceId, text(input.issue));
          const id = await createComment(ctx, { issueId: issue._id, content: body });
          return toolResult(asJson({ id }));
        }
        case "delete_comment": {
          const id = await removeComment(ctx, text(input.id) as Id<"comments">);
          return toolResult(asJson({ id }));
        }
        default:
          throw new Error(`Unknown tool: ${args.name}`);
      }
    } finally {
      setMcpActor(undefined);
    }
  },
});
