import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ISSUE_STATUS_LABELS, PRIORITY_LABELS, type IssueStatus, type Priority } from "../model";
import { loadPublicUser } from "./access";

export const ACTIVITY_TYPES = [
  "created",
  "title_changed",
  "description_changed",
  "status_changed",
  "priority_changed",
  "assignee_changed",
  "due_date_set",
  "due_date_changed",
  "due_date_cleared",
  "labels_added",
  "labels_removed",
  "comment_added",
  "comment_edited",
  "comment_deleted",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export async function recordActivity(
  ctx: MutationCtx,
  args: {
    issueId: Id<"issues">;
    workspaceId: Id<"workspaces">;
    actorId: Id<"users">;
    type: ActivityType;
    fromLabel?: string;
    toLabel?: string;
  },
) {
  await ctx.db.insert("activities", {
    issueId: args.issueId,
    workspaceId: args.workspaceId,
    actorId: args.actorId,
    createdAt: Date.now(),
    type: args.type,
    ...(args.fromLabel !== undefined ? { fromLabel: args.fromLabel } : {}),
    ...(args.toLabel !== undefined ? { toLabel: args.toLabel } : {}),
  });
}

export function statusActivityLabel(status: IssueStatus) {
  return ISSUE_STATUS_LABELS[status];
}

export function priorityActivityLabel(priority: Priority) {
  return PRIORITY_LABELS[priority];
}

export function dueDateActivityLabel(timestamp: number) {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function userActivityLabel(
  ctx: MutationCtx,
  userId: Id<"users"> | undefined,
) {
  if (!userId) return "Unassigned";
  const user = await loadPublicUser(ctx, userId);
  return user?.name || user?.email || "Unassigned";
}

export async function labelNames(
  ctx: MutationCtx,
  labelIds: Id<"labels">[],
) {
  const names: string[] = [];
  for (const labelId of labelIds) {
    const label = await ctx.db.get("labels", labelId);
    if (label) names.push(label.name);
  }
  return names;
}
