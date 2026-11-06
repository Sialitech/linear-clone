export const WORKFLOW_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
] as const;

export const ISSUE_STATUSES = ["triage", ...WORKFLOW_STATUSES, "canceled"] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

const workflowStatusSet = new Set<string>(WORKFLOW_STATUSES);

export function isWorkflowStatus(status: string): status is WorkflowStatus {
  return workflowStatusSet.has(status);
}

export const TRIAGE_ACTIONS = ["send", "accept", "decline", "snooze"] as const;

export type TriageAction = (typeof TRIAGE_ACTIONS)[number];

export function splitTriage<
  T extends { snoozedUntil: number | null; priority: Priority; createdAt: number },
>(issues: T[], now: number) {
  const waiting: T[] = [];
  const snoozed: T[] = [];
  for (const issue of issues) {
    if (issue.snoozedUntil !== null && issue.snoozedUntil > now) snoozed.push(issue);
    else waiting.push(issue);
  }
  waiting.sort((a, b) => {
    const diff = PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
    if (diff !== 0) return diff;
    return a.createdAt - b.createdAt;
  });
  snoozed.sort((a, b) => (a.snoozedUntil ?? 0) - (b.snoozedUntil ?? 0));
  return { waiting, snoozed };
}

export const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;

export type Priority = (typeof PRIORITIES)[number];

export const PROJECT_STATUSES = [
  "planned",
  "active",
  "paused",
  "completed",
  "canceled",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const MEMBER_ROLES = ["owner", "admin", "member"] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];

export const ASSIGNEE_MODES = ["anyone", "me", "unassigned", "user"] as const;

export type AssigneeMode = (typeof ASSIGNEE_MODES)[number];

export const VIEW_GROUPS = ["status", "priority", "assignee", "project"] as const;

export type ViewGroup = (typeof VIEW_GROUPS)[number];

export const VIEW_GROUP_LABELS: Record<ViewGroup, string> = {
  status: "Status",
  priority: "Priority",
  assignee: "Assignee",
  project: "Project",
};

export const VIEW_ORDERS = ["priority", "status", "updated", "created", "due"] as const;

export type ViewOrder = (typeof VIEW_ORDERS)[number];

export const VIEW_ORDER_LABELS: Record<ViewOrder, string> = {
  priority: "Priority",
  status: "Status",
  updated: "Updated",
  created: "Created",
  due: "Due date",
};

export const CYCLE_STATUSES = ["upcoming", "active", "completed"] as const;

export type CycleStatus = (typeof CYCLE_STATUSES)[number];

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  triage: "Triage",
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  canceled: "Canceled",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: "Planned",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  canceled: "Canceled",
};

export const CYCLE_STATUS_LABELS: Record<CycleStatus, string> = {
  upcoming: "Upcoming",
  active: "Active",
  completed: "Completed",
};
