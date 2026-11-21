import type { ViewGroup, ViewOrder } from "@convex/model";
import PriorityIcon from "@/components/priority-icon";
import StatusIcon from "@/components/status-icon";
import UserAvatar from "@/components/user-avatar";
import { projectColor } from "@/lib/format";
import { groupIssues } from "@/lib/issue-groups";
import type { IssueItem } from "@/lib/types";
import type { ReactNode } from "react";

function groupIcon(groupBy: ViewGroup, sample: IssueItem): ReactNode {
  if (groupBy === "status") return <StatusIcon status={sample.status} />;
  if (groupBy === "priority") return <PriorityIcon priority={sample.priority} />;
  if (groupBy === "assignee") return <UserAvatar user={sample.assignee} />;
  return (
    <span
      className="size-2.5 shrink-0 rounded-[3px]"
      style={{ backgroundColor: projectColor(sample.projectKey) }}
      aria-hidden
    />
  );
}

/** Grupos y subgrupos con su icono, listos para `IssueList`. Compartido por vistas y proyectos. */
export function buildIssueGroups(
  issues: IssueItem[],
  groupBy: ViewGroup,
  subGroupBy: ViewGroup | null,
  orderBy: ViewOrder,
) {
  const nestedBy = subGroupBy && subGroupBy !== groupBy ? subGroupBy : null;
  return groupIssues(issues, groupBy, orderBy).map((group) => ({
    ...group,
    icon: group.issues[0] ? groupIcon(groupBy, group.issues[0]) : undefined,
    groups: nestedBy
      ? groupIssues(group.issues, nestedBy, orderBy).map((subgroup) => ({
          ...subgroup,
          key: `${group.key}:${subgroup.key}`,
          icon: subgroup.issues[0] ? groupIcon(nestedBy, subgroup.issues[0]) : undefined,
        }))
      : undefined,
  }));
}
