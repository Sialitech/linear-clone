import {
  ISSUE_STATUSES,
  ISSUE_STATUS_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  type IssueStatus,
  type Priority,
  type ViewGroup,
  type ViewOrder,
} from "@convex/model";

export type GroupableIssue = {
  _id: string;
  updatedAt: number;
  createdAt: number;
  dueDate: number | null;
  status: IssueStatus;
  priority: Priority;
  projectId: string;
  projectName: string;
  assignee: { _id: string; name: string | null; email: string | null } | null;
};

export type IssueGroup<T extends GroupableIssue> = {
  key: string;
  label: string;
  issues: T[];
};

function assigneeLabel(issue: GroupableIssue) {
  if (!issue.assignee) return "Unassigned";
  return issue.assignee.name || issue.assignee.email || "Unassigned";
}

function groupKey(issue: GroupableIssue, groupBy: ViewGroup) {
  if (groupBy === "status") return issue.status;
  if (groupBy === "priority") return issue.priority;
  if (groupBy === "project") return issue.projectId;
  return issue.assignee?._id ?? "unassigned";
}

function groupLabel(issue: GroupableIssue, groupBy: ViewGroup) {
  if (groupBy === "status") return ISSUE_STATUS_LABELS[issue.status];
  if (groupBy === "priority") return PRIORITY_LABELS[issue.priority];
  if (groupBy === "project") return issue.projectName;
  return assigneeLabel(issue);
}

function compareGroups(a: { key: string; label: string }, b: { key: string; label: string }, groupBy: ViewGroup) {
  if (groupBy === "status") {
    return ISSUE_STATUSES.indexOf(a.key as IssueStatus) - ISSUE_STATUSES.indexOf(b.key as IssueStatus);
  }
  if (groupBy === "priority") {
    return PRIORITIES.indexOf(a.key as Priority) - PRIORITIES.indexOf(b.key as Priority);
  }
  if (groupBy === "assignee") {
    if (a.key === "unassigned") return 1;
    if (b.key === "unassigned") return -1;
  }
  return a.label.localeCompare(b.label);
}

export function compareIssues(a: GroupableIssue, b: GroupableIssue, order: ViewOrder) {
  if (order === "priority") {
    const diff = PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
    if (diff !== 0) return diff;
  } else if (order === "status") {
    const diff = ISSUE_STATUSES.indexOf(a.status) - ISSUE_STATUSES.indexOf(b.status);
    if (diff !== 0) return diff;
  } else if (order === "created") {
    const diff = b.createdAt - a.createdAt;
    if (diff !== 0) return diff;
  } else if (order === "due") {
    const aDue = a.dueDate ?? Number.POSITIVE_INFINITY;
    const bDue = b.dueDate ?? Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
  } else {
    const diff = b.updatedAt - a.updatedAt;
    if (diff !== 0) return diff;
  }
  return a._id.localeCompare(b._id);
}

export function sortIssues<T extends GroupableIssue>(issues: readonly T[], order: ViewOrder) {
  return [...issues].sort((a, b) => compareIssues(a, b, order));
}

export function groupIssues<T extends GroupableIssue>(
  issues: readonly T[],
  groupBy: ViewGroup,
  order: ViewOrder = "updated",
): IssueGroup<T>[] {
  const buckets = new Map<string, IssueGroup<T>>();
  for (const issue of issues) {
    const key = groupKey(issue, groupBy);
    const existing = buckets.get(key);
    if (existing) existing.issues.push(issue);
    else buckets.set(key, { key, label: groupLabel(issue, groupBy), issues: [issue] });
  }
  const groups = [...buckets.values()];
  for (const group of groups) {
    group.issues = sortIssues(group.issues, order);
  }
  groups.sort((a, b) => compareGroups(a, b, groupBy));
  return groups;
}
