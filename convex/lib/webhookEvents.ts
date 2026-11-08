import type { WebhookValue } from "./webhookPayload";

export const WEBHOOK_EVENT_IDS = [
  "issue.created",
  "issue.deleted",
  "issue.title_changed",
  "issue.description_changed",
  "issue.status_changed",
  "issue.priority_changed",
  "issue.assignee_changed",
  "issue.due_date_set",
  "issue.due_date_changed",
  "issue.due_date_cleared",
  "issue.labels_added",
  "issue.labels_removed",
  "issue.cycle_changed",
  "issue.project_changed",
  "issue.parent_set",
  "issue.parent_cleared",
  "issue.sub_issue_added",
  "issue.sub_issue_removed",
  "issue.snoozed",
  "issue.unsnoozed",
  "comment.created",
  "comment.edited",
  "comment.deleted",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENT_IDS)[number];

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "issue.created": "Issue created",
  "issue.deleted": "Issue deleted",
  "issue.title_changed": "Title changed",
  "issue.description_changed": "Description changed",
  "issue.status_changed": "Status changed",
  "issue.priority_changed": "Priority changed",
  "issue.assignee_changed": "Assignee changed",
  "issue.due_date_set": "Due date set",
  "issue.due_date_changed": "Due date changed",
  "issue.due_date_cleared": "Due date cleared",
  "issue.labels_added": "Labels added",
  "issue.labels_removed": "Labels removed",
  "issue.cycle_changed": "Cycle changed",
  "issue.project_changed": "Project changed",
  "issue.parent_set": "Parent set",
  "issue.parent_cleared": "Parent cleared",
  "issue.sub_issue_added": "Sub-issue added",
  "issue.sub_issue_removed": "Sub-issue removed",
  "issue.snoozed": "Snoozed",
  "issue.unsnoozed": "Unsnoozed",
  "comment.created": "Comment added",
  "comment.edited": "Comment edited",
  "comment.deleted": "Comment deleted",
};

const ISSUE_EVENTS = WEBHOOK_EVENT_IDS.filter((event) => event.startsWith("issue."));
const COMMENT_EVENTS = WEBHOOK_EVENT_IDS.filter((event) => event.startsWith("comment."));

export const WEBHOOK_EVENT_GROUPS = [
  { id: "issue", label: "Issue", events: ISSUE_EVENTS },
  { id: "comment", label: "Comment", events: COMMENT_EVENTS },
] as const;

export type IssueChangeSnapshot = {
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  projectId: string;
  identifier: string;
  labelIds: string[];
  dueDate: number | null;
  cycleId: string | null;
  parentId: string | null;
  snoozedUntil: number | null;
};

export type CommentChangeSnapshot = {
  content: string;
  mentionIds: string[];
};

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENT_IDS as readonly string[]).includes(value);
}

export function expandWebhookResources(resources: readonly string[]) {
  const selected = new Set<WebhookEvent>();
  for (const resource of resources) {
    if (resource === "Issue") {
      for (const event of ISSUE_EVENTS) selected.add(event);
    } else if (resource === "Comment") {
      for (const event of COMMENT_EVENTS) selected.add(event);
    } else if (isWebhookEvent(resource)) {
      selected.add(resource);
    }
  }
  return WEBHOOK_EVENT_IDS.filter((event) => selected.has(event));
}

export function subscribesTo(resources: readonly string[], event: WebhookEvent) {
  return expandWebhookResources(resources).includes(event);
}

export function webhookSelectionLabel(resources: readonly string[]) {
  const selected = expandWebhookResources(resources);
  if (selected.length === 0) return "No events";
  if (selected.length === WEBHOOK_EVENT_IDS.length) return "All events";
  if (selected.length > 3) return `${selected.length} events`;
  return selected.map((event) => WEBHOOK_EVENT_LABELS[event]).join(", ");
}

export function issueChangeEvents(before: IssueChangeSnapshot, after: IssueChangeSnapshot) {
  const events: { event: WebhookEvent; updatedFrom: Record<string, WebhookValue> }[] = [];
  const push = (event: WebhookEvent, updatedFrom: Record<string, WebhookValue>) => {
    events.push({ event, updatedFrom });
  };
  if (before.title !== after.title) push("issue.title_changed", { title: before.title });
  if (before.description !== after.description) {
    push("issue.description_changed", { description: before.description });
  }
  if (before.status !== after.status) push("issue.status_changed", { status: before.status });
  if (before.priority !== after.priority) push("issue.priority_changed", { priority: before.priority });
  if (before.assigneeId !== after.assigneeId) {
    push("issue.assignee_changed", { assigneeId: before.assigneeId });
  }
  if (before.projectId !== after.projectId) {
    const updatedFrom: Record<string, WebhookValue> = { projectId: before.projectId };
    if (before.identifier !== after.identifier) updatedFrom.identifier = before.identifier;
    push("issue.project_changed", updatedFrom);
  }
  if (before.cycleId !== after.cycleId) push("issue.cycle_changed", { cycleId: before.cycleId });
  if (before.parentId !== after.parentId) {
    if (before.parentId) push("issue.parent_cleared", { parentId: before.parentId });
    if (after.parentId) push("issue.parent_set", { parentId: before.parentId });
  }
  if (before.dueDate !== after.dueDate) {
    if (before.dueDate === null) push("issue.due_date_set", { dueDate: null });
    else if (after.dueDate === null) push("issue.due_date_cleared", { dueDate: before.dueDate });
    else push("issue.due_date_changed", { dueDate: before.dueDate });
  }
  if (before.snoozedUntil !== after.snoozedUntil) {
    if (after.snoozedUntil !== null) push("issue.snoozed", { snoozedUntil: before.snoozedUntil });
    if (before.snoozedUntil !== null && after.snoozedUntil === null) {
      push("issue.unsnoozed", { snoozedUntil: before.snoozedUntil });
    }
  }
  const previousLabels = [...before.labelIds].sort();
  const nextLabels = [...after.labelIds].sort();
  const previousSet = new Set(previousLabels);
  const nextSet = new Set(nextLabels);
  if (nextLabels.some((id) => !previousSet.has(id))) {
    push("issue.labels_added", { labelIds: previousLabels });
  }
  if (previousLabels.some((id) => !nextSet.has(id))) {
    push("issue.labels_removed", { labelIds: previousLabels });
  }
  return events;
}

export function commentChangeEvents(before: CommentChangeSnapshot, after: CommentChangeSnapshot) {
  const updatedFrom: Record<string, WebhookValue> = {};
  if (before.content !== after.content) updatedFrom.content = before.content;
  if (!sameList(before.mentionIds, after.mentionIds)) updatedFrom.mentionIds = before.mentionIds;
  if (Object.keys(updatedFrom).length === 0) return [];
  return [{ event: "comment.edited" as const, updatedFrom }];
}

function sameList(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
