"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ISSUE_STATUSES,
  PRIORITIES,
  type IssueStatus,
  type Priority,
} from "@convex/model";
import IssueList from "@/components/issue-list";
import KanbanBoard from "@/components/kanban-board";
import PriorityIcon, { priorityLabel } from "@/components/priority-icon";
import StatusIcon, { statusLabel } from "@/components/status-icon";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { LayoutGrid, List, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const viewNameSchema = z.string().trim().min(1).max(80);

export default function ProjectScreen({
  projectId,
  mode,
}: {
  projectId: string;
  mode: "list" | "board";
}) {
  const id = projectId as Id<"projects">;
  const { workspace, openCreate, me } = useWorkspace();
  const project = useQuery(api.projects.get, { projectId: id });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<IssueStatus | "">("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [assignee, setAssignee] = useState<"anyone" | "me" | "unassigned">("anyone");
  const [saving, setSaving] = useState(false);
  const createView = useMutation(api.views.create);
  const listArgs = workspace
    ? {
        workspaceId: workspace._id,
        projectId: id,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(assignee === "me" && me ? { assigneeId: me._id } : {}),
        ...(assignee === "unassigned" ? { unassigned: true as const } : {}),
      }
    : "skip";
  const issues = useQuery(api.issues.list, mode === "board" ? (workspace ? { workspaceId: workspace._id, projectId: id } : "skip") : listArgs);

  async function saveView() {
    if (!workspace) return;
    const name = window.prompt("View name");
    if (!name) return;
    const parsed = viewNameSchema.safeParse(name);
    if (!parsed.success) {
      toast.error("Enter a view name");
      return;
    }
    setSaving(true);
    try {
      await createView({
        workspaceId: workspace._id,
        name: parsed.data,
        projectId: id,
        assigneeMode: assignee === "anyone" ? "anyone" : assignee,
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(assignee === "me" && me ? { assigneeId: me._id } : {}),
      });
      toast.success("View saved");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (project === null) {
    return <div className="p-6 text-sm text-muted-foreground">Project not found.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 items-center gap-3 border-b border-border px-4">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-medium">{project?.name ?? "Project"}</h1>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{project?.key}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" size="sm" onClick={() => openCreate({ projectId: id })}>
            <Plus className="size-3.5" />
            Issue
          </Button>
          <Link
            href={`/projects/${projectId}`}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-white/5",
              mode === "list" && "bg-white/8 text-foreground",
            )}
          >
            <List className="size-3.5" />
            List
          </Link>
          <Link
            href={`/projects/${projectId}/board`}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-white/5",
              mode === "board" && "bg-white/8 text-foreground",
            )}
          >
            <LayoutGrid className="size-3.5" />
            Board
          </Link>
        </div>
      </header>
      {mode === "list" ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search issues"
            className="h-7 w-48"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as IssueStatus | "")}
            className="h-7 rounded-md border border-border bg-transparent px-2 text-xs"
          >
            <option value="">Any status</option>
            {ISSUE_STATUSES.map((item) => (
              <option key={item} value={item}>
                {statusLabel(item)}
              </option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as Priority | "")}
            className="h-7 rounded-md border border-border bg-transparent px-2 text-xs"
          >
            <option value="">Any priority</option>
            {PRIORITIES.map((item) => (
              <option key={item} value={item}>
                {priorityLabel(item)}
              </option>
            ))}
          </select>
          <select
            value={assignee}
            onChange={(event) => setAssignee(event.target.value as "anyone" | "me" | "unassigned")}
            className="h-7 rounded-md border border-border bg-transparent px-2 text-xs"
          >
            <option value="anyone">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
          <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => void saveView()}>
            Save view
          </Button>
          <span className="sr-only">
            <StatusIcon status="todo" />
            <PriorityIcon priority="none" />
          </span>
        </div>
      ) : null}
      {mode === "board" && workspace ? (
        <KanbanBoard issues={issues} workspaceId={workspace._id} projectId={id} />
      ) : (
        <IssueList issues={issues} empty="No issues match these filters." />
      )}
    </div>
  );
}
