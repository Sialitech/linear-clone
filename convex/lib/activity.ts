import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ISSUE_STATUS_LABELS, PRIORITY_LABELS, type IssueStatus, type Priority } from "../model";
import { loadPublicUser } from "./access";

export type ActivityType =
  | "created"
  | "title_changed"
  | "description_changed"
  | "status_changed"
  | "priority_changed"
  | "assignee_changed"
  | "due_date_set"
  | "due_date_changed"
  | "due_date_cleared"
  | "labels_added"
  | "labels_removed"
  | "comment_added"
  | "comment_edited"
  | "comment_deleted";

type RecordArgs = {
  issueId: Id<"issues">;
  workspaceId: Id<"workspaces">;
  actorId: Id<"users">;
  type: ActivityType;
  fromLabel?: string;
  toLabel?: string;
};

export async function recordActivity(ctx: MutationCtx, args: RecordArgs) {
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

export function statusLabel(status: IssueStatus) {
  return ISSUE_STATUS_LABELS[status];
}

export function priorityLabel(priority: Priority) {
  return PRIORITY_LABELS[priority];
}

export async function assigneeLabel(
  ctx: MutationCtx,
  assigneeId: Id<"users"> | undefined,
) {
  if (!assigneeId) return "Unassigned";
  const user = await loadPublicUser(ctx, assigneeId);
  return user?.name || user?.email || "Unassigned";
}

export function dueDateLabel(timestamp: number | undefined) {
  if (timestamp === undefined) return undefined;
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function sameIdSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, index) => id === right[index]);
}
