"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { hasAnyFilter, normalizeFilters, toListFilters } from "@convex/lib/viewFilters";
import IssueList from "@/components/issue-list";
import { buildIssueGroups } from "@/components/issue-group-builder";
import IssueSkeleton from "@/components/issue-skeleton";
import ViewControls from "@/components/view-controls";
import { useWorkspace } from "@/components/workspace-provider";
import { sortIssues } from "@/lib/issue-groups";
import { useQuery } from "convex/react";

export default function SavedViewScreen({ viewId }: { viewId: string }) {
  const id = viewId as Id<"views">;
  const { workspace, me } = useWorkspace();
  const view = useQuery(api.views.get, { viewId: id });
  const filters = view ? normalizeFilters(view) : null;
  const needsMe = filters?.assignees.includes("me") ?? false;
  const ready = view && filters && workspace && (!needsMe || me);
  const issues = useQuery(
    api.issues.list,
    ready
      ? {
          workspaceId: workspace._id,
          ...(view.projectId ? { projectId: view.projectId } : {}),
          ...toListFilters(filters, me?._id),
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
  const hasFilter = Boolean(view && (view.projectId || (filters && hasAnyFilter(filters))));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {view ? (
        <ViewControls view={view} canEdit={canEdit} title={view.name}>
          {({ groupBy, subGroupBy, orderBy, showSubIssues }) => {
            const ordered = issues ? sortIssues(issues, orderBy) : undefined;
            return (
              <IssueList
                issues={ordered}
                preserveOrder
                showSubIssues={showSubIssues}
                empty={hasFilter ? "No issues match these filters." : "No issues in this view."}
                groups={groupBy && ordered ? buildIssueGroups(ordered, groupBy, subGroupBy, orderBy) : undefined}
              />
            );
          }}
        </ViewControls>
      ) : (
        <>
          <header className="flex min-h-12 items-center border-b border-border px-3 sm:px-4">
            <span className="inline-block h-3.5 w-36 animate-pulse rounded-md bg-muted" />
          </header>
          <IssueSkeleton />
        </>
      )}
    </div>
  );
}
