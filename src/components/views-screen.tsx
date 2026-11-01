"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ViewGroup } from "@convex/model";
import IssueList from "@/components/issue-list";
import PriorityIcon from "@/components/priority-icon";
import StatusIcon from "@/components/status-icon";
import UserAvatar from "@/components/user-avatar";
import ViewControls from "@/components/view-controls";
import { useWorkspace } from "@/components/workspace-provider";
import { projectColor } from "@/lib/format";
import { groupIssues, sortIssues } from "@/lib/issue-groups";
import type { IssueItem } from "@/lib/types";
import { useQuery } from "convex/react";
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

export default function SavedViewScreen({ viewId }: { viewId: string }) {
  const id = viewId as Id<"views">;
  const { workspace, me } = useWorkspace();
  const view = useQuery(api.views.get, { viewId: id });
  const ready = view && workspace && (view.assigneeMode !== "me" || me);
  const issues = useQuery(
    api.issues.list,
    ready
      ? {
          workspaceId: workspace._id,
          ...(view.projectId ? { projectId: view.projectId } : {}),
          ...(view.status ? { status: view.status } : {}),
          ...(view.priority ? { priority: view.priority } : {}),
          ...(view.labelId ? { labelId: view.labelId } : {}),
          ...(view.assigneeMode === "me" && me ? { assigneeId: me._id } : {}),
          ...(view.assigneeMode === "user" && view.assigneeId ? { assigneeId: view.assigneeId } : {}),
          ...(view.assigneeMode === "unassigned" ? { unassigned: true as const } : {}),
        }
      : "skip",
  );

  if (view === null) {
    return <div className="p-6 text-sm text-muted-foreground">View not found.</div>;
  }

  const canEdit = Boolean(
    view &&
      me &&
      workspace &&
      (view.ownerId === me._id || workspace.role === "owner" || workspace.role === "admin"),
  );
  const hasFilter = Boolean(
    view &&
      (view.projectId ||
        view.status ||
        view.priority ||
        view.labelId ||
        view.assigneeMode !== "anyone"),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {view ? (
        <ViewControls view={view} canEdit={canEdit} title={view.name}>
          {({ groupBy, subGroupBy, orderBy, showSubIssues }) => {
            const ordered = issues ? sortIssues(issues, orderBy) : undefined;
            const nestedBy = subGroupBy && subGroupBy !== groupBy ? subGroupBy : null;
            return (
              <IssueList
                issues={ordered}
                preserveOrder
                showSubIssues={showSubIssues}
                empty={hasFilter ? "No issues match these filters." : "No issues in this view."}
                groups={
                  groupBy && ordered
                    ? groupIssues(ordered, groupBy, orderBy).map((group) => ({
                        ...group,
                        icon: group.issues[0] ? groupIcon(groupBy, group.issues[0]) : undefined,
                        groups: nestedBy
                          ? groupIssues(group.issues, nestedBy, orderBy).map((subgroup) => ({
                              ...subgroup,
                              key: `${group.key}:${subgroup.key}`,
                              icon: subgroup.issues[0] ? groupIcon(nestedBy, subgroup.issues[0]) : undefined,
                            }))
                          : undefined,
                      }))
                    : undefined
                }
              />
            );
          }}
        </ViewControls>
      ) : (
        <>
          <header className="flex min-h-12 items-center border-b border-border px-3 sm:px-4">
            <h1 className="truncate text-sm font-medium">View</h1>
          </header>
          <IssueList issues={issues} empty="No issues in this view." />
        </>
      )}
    </div>
  );
}
