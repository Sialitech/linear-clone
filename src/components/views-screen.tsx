"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import IssueList from "@/components/issue-list";
import { useWorkspace } from "@/components/workspace-provider";
import { useQuery } from "convex/react";

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-12 items-center border-b border-border px-3 sm:px-4">
        <h1 className="truncate text-sm font-medium">{view?.name ?? "View"}</h1>
      </header>
      <IssueList issues={issues} empty="No issues in this view." />
    </div>
  );
}
