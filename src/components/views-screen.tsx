"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ISSUE_STATUSES, type AssigneeMode, type IssueStatus } from "@convex/model";
import IssueList from "@/components/issue-list";
import { statusLabel } from "@/components/status-icon";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/format";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const nameSchema = z.string().trim().min(1, "Enter a name").max(80);

export default function ViewsScreen() {
  const { workspace } = useWorkspace();
  const views = useQuery(api.views.list, workspace ? { workspaceId: workspace._id } : "skip");
  const create = useMutation(api.views.create);
  const remove = useMutation(api.views.remove);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<IssueStatus | "">("");
  const [assigneeMode, setAssigneeMode] = useState<AssigneeMode>("anyone");

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!workspace) return;
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Enter a name");
      return;
    }
    try {
      await create({
        workspaceId: workspace._id,
        name: parsed.data,
        assigneeMode,
        ...(status ? { status } : {}),
      });
      setName("");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 items-center border-b border-border px-4">
        <h1 className="text-sm font-medium">Saved views</h1>
      </header>
      <form onSubmit={onCreate} className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="View name" className="h-7 w-48" />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as IssueStatus | "")}
          className="h-7 rounded-md border border-border bg-transparent px-2 text-xs"
        >
          <option value="">Any status</option>
          {ISSUE_STATUSES.map((item) => (
            <option key={item} value={item}>{statusLabel(item)}</option>
          ))}
        </select>
        <select
          value={assigneeMode}
          onChange={(event) => setAssigneeMode(event.target.value as AssigneeMode)}
          className="h-7 rounded-md border border-border bg-transparent px-2 text-xs"
        >
          <option value="anyone">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </select>
        <Button type="submit" size="sm">Save view</Button>
      </form>
      <div className="min-h-0 flex-1 overflow-auto">
        {views?.map((view) => (
          <div key={view._id} className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm">
            <Link href={`/views/${view._id}`} className="min-w-0 flex-1 truncate hover:underline">
              {view.name}
            </Link>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => void remove({ viewId: view._id }).catch((error: unknown) => toast.error(errorMessage(error)))}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SavedViewScreen({ viewId }: { viewId: string }) {
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
      <header className="flex h-12 items-center border-b border-border px-4">
        <h1 className="text-sm font-medium">{view?.name ?? "View"}</h1>
      </header>
      <IssueList issues={issues} empty="No issues in this view." />
    </div>
  );
}
