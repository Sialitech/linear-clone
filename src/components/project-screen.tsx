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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { errorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { GitBranch, LayoutGrid, List, Plus, SlidersHorizontal } from "lucide-react";
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
  const [showSubIssues, setShowSubIssues] = useState(true);
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
      <header className="flex min-h-12 items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium">
            {project?.name ?? "Project"}
            {project?.key ? (
              <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{project.key}</span>
            ) : null}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" size="sm" className="h-9 sm:h-7" onClick={() => openCreate({ projectId: id })}>
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">Issue</span>
            <span className="sm:hidden">New</span>
          </Button>
          <Link
            href={`/projects/${projectId}`}
            aria-label="List"
            className={cn(
              "inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-white/5 sm:h-7",
              mode === "list" && "bg-white/8 text-foreground",
            )}
          >
            <List className="size-3.5" />
            <span className="hidden sm:inline">List</span>
          </Link>
          <Link
            href={`/projects/${projectId}/board`}
            aria-label="Board"
            className={cn(
              "inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-white/5 sm:h-7",
              mode === "board" && "bg-white/8 text-foreground",
            )}
          >
            <LayoutGrid className="size-3.5" />
            <span className="hidden sm:inline">Board</span>
          </Link>
        </div>
      </header>
      {mode === "list" ? (
        <div className="flex flex-col gap-2 border-b border-border px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:px-4">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search issues"
            className="h-9 w-full sm:h-7 sm:w-48"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as IssueStatus | "")}
            className="h-9 w-full rounded-md border border-border bg-transparent px-2 text-base sm:h-7 sm:w-auto sm:text-xs"
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
            className="h-9 w-full rounded-md border border-border bg-transparent px-2 text-base sm:h-7 sm:w-auto sm:text-xs"
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
            className="h-9 w-full rounded-md border border-border bg-transparent px-2 text-base sm:h-7 sm:w-auto sm:text-xs"
          >
            <option value="anyone">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
          <Button type="button" variant="ghost" size="sm" className="h-9 sm:h-7" disabled={saving} onClick={() => void saveView()}>
            Save view
          </Button>
          <Popover>
            <PopoverTrigger
              render={
                <Button type="button" variant="ghost" size="sm" className="h-9 sm:h-7" aria-label="Display options" />
              }
            >
              <SlidersHorizontal className="size-3.5" />
              Display
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2">
              <label className="flex h-8 items-center gap-2 px-2 text-[13px]">
                <GitBranch className="size-3.5 text-muted-foreground" />
                <span className="flex-1">Show sub-issues</span>
                <input
                  type="checkbox"
                  className="size-3.5 accent-foreground"
                  checked={showSubIssues}
                  onChange={(event) => setShowSubIssues(event.target.checked)}
                />
              </label>
            </PopoverContent>
          </Popover>
          <span className="sr-only">
            <StatusIcon status="todo" />
            <PriorityIcon priority="none" />
          </span>
        </div>
      ) : null}
      {mode === "board" && workspace ? (
        <KanbanBoard issues={issues} workspaceId={workspace._id} projectId={id} />
      ) : (
        <IssueList issues={issues} empty="No issues match these filters." showSubIssues={showSubIssues} />
      )}
    </div>
  );
}
