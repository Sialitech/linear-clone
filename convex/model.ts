export const ISSUE_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];

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

export const CYCLE_STATUSES = ["upcoming", "active", "completed"] as const;

export type CycleStatus = (typeof CYCLE_STATUSES)[number];

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
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
