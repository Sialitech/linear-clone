"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ISSUE_STATUSES, PRIORITIES, type IssueStatus, type Priority } from "@convex/model";
import PriorityIcon, { priorityLabel } from "@/components/priority-icon";
import StatusIcon, { statusLabel } from "@/components/status-icon";
import UserAvatar from "@/components/user-avatar";
import { useWorkspace } from "@/components/workspace-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  dateInputToTimestamp,
  dateInputValue,
  endOfThisWeekTimestamp,
  errorMessage,
  formatMenuDate,
  inOneWeekTimestamp,
  projectColor,
  tomorrowTimestamp,
} from "@/lib/format";
import type { IssueItem } from "@/lib/types";
import { useMutation, useQuery } from "convex/react";
import { CalendarX2, Copy, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function IssueSelectionBar({
  issues,
  onClear,
}: {
  issues: IssueItem[];
  onClear: () => void;
}) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?._id ?? issues[0]?.workspaceId;
  const members = useQuery(api.users.listMembers, workspaceId ? { workspaceId } : "skip");
  const labels = useQuery(api.labels.list, workspaceId ? { workspaceId } : "skip");
  const projects = useQuery(api.projects.list, workspaceId ? { workspaceId } : "skip");
  const update = useMutation(api.issues.update);
  const remove = useMutation(api.issues.remove);
  const [busy, setBusy] = useState(false);
  const count = issues.length;
  const tomorrow = tomorrowTimestamp();
  const endOfWeek = endOfThisWeekTimestamp();
  const inOneWeek = inOneWeekTimestamp();

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      onClear();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function patchEach(
    patch: (issue: IssueItem) => Parameters<typeof update>[0] | null,
    success: string,
  ) {
    await run(async () => {
      await Promise.all(
        issues.map((issue) => {
          const args = patch(issue);
          return args ? update(args) : Promise.resolve();
        }),
      );
    }, success);
  }

  async function setStatus(status: IssueStatus) {
    await patchEach((issue) => ({ issueId: issue._id, status }), `Status updated on ${count}`);
  }

  async function setPriority(priority: Priority) {
    await patchEach((issue) => ({ issueId: issue._id, priority }), `Priority updated on ${count}`);
  }

  async function setAssignee(assigneeId: Id<"users"> | null) {
    await patchEach(
      (issue) => ({ issueId: issue._id, assigneeId }),
      assigneeId ? `Assigned ${count}` : `Unassigned ${count}`,
    );
  }

  async function setDue(dueDate: number | null) {
    await patchEach(
      (issue) => ({ issueId: issue._id, dueDate }),
      dueDate ? `Due date set on ${count}` : `Due date cleared on ${count}`,
    );
  }

  async function setProject(projectId: Id<"projects">) {
    await patchEach((issue) => ({ issueId: issue._id, projectId }), `Moved ${count}`);
  }

  async function toggleLabel(labelId: Id<"labels">) {
    const allHave = issues.every((issue) => issue.labels.some((label) => label._id === labelId));
    const overflow = issues.some((issue) => {
      if (allHave || issue.labels.some((label) => label._id === labelId)) return false;
      return issue.labels.length >= 12;
    });
    if (overflow) {
      toast.error("An issue can have at most 12 labels");
      return;
    }
    await patchEach((issue) => {
      const ids = issue.labels.map((label) => label._id);
      const has = ids.includes(labelId);
      if (allHave) return { issueId: issue._id, labelIds: ids.filter((id) => id !== labelId) };
      if (has) return null;
      return { issueId: issue._id, labelIds: [...ids, labelId] };
    }, allHave ? `Label removed from ${count}` : `Label added to ${count}`);
  }

  async function copyLinks() {
    const text = issues.map((issue) => `${window.location.origin}/issues/${issue._id}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(count === 1 ? "Link copied" : `${count} links copied`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function deleteSelected() {
    if (!window.confirm(`Delete ${count} issue${count === 1 ? "" : "s"}?`)) return;
    await run(async () => {
      await Promise.all(issues.map((issue) => remove({ issueId: issue._id })));
    }, `Deleted ${count}`);
  }

  return (
    <div className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 mx-3 mt-3 flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl border border-border bg-popover px-2 py-1 text-sm shadow-lg sm:mx-auto sm:w-fit sm:rounded-full">
      <span className="px-2 font-medium">{count} selected</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          className="rounded-full px-2.5 py-1 hover:bg-accent disabled:opacity-50"
        >
          Status
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          {ISSUE_STATUSES.map((status) => (
            <DropdownMenuItem key={status} onClick={() => void setStatus(status)}>
              <StatusIcon status={status} />
              {statusLabel(status)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          className="rounded-full px-2.5 py-1 hover:bg-accent disabled:opacity-50"
        >
          Priority
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          {PRIORITIES.map((priority) => (
            <DropdownMenuItem key={priority} onClick={() => void setPriority(priority)}>
              <PriorityIcon priority={priority} />
              {priorityLabel(priority)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          className="rounded-full px-2.5 py-1 hover:bg-accent disabled:opacity-50"
        >
          Assignee
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          <DropdownMenuItem onClick={() => void setAssignee(null)}>Unassigned</DropdownMenuItem>
          {members?.map((member) => (
            <DropdownMenuItem key={member._id} onClick={() => void setAssignee(member._id)}>
              <UserAvatar user={member} />
              {member.name || member.email}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          className="rounded-full px-2.5 py-1 hover:bg-accent disabled:opacity-50"
        >
          Due date
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" className="w-64">
          <DropdownMenuItem onClick={() => void setDue(null)}>
            <CalendarX2 />
            Remove due date
          </DropdownMenuItem>
          <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm">
            Custom
            <input
              type="date"
              aria-label="Custom due date"
              defaultValue={dateInputValue(null)}
              className="ml-auto h-7 rounded-md border border-border bg-transparent px-1 text-xs"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                const timestamp = dateInputToTimestamp(event.target.value);
                if (timestamp) void setDue(timestamp);
              }}
            />
          </label>
          <DropdownMenuItem onClick={() => void setDue(tomorrow)}>
            Tomorrow
            <span className="ml-auto text-xs text-muted-foreground">{formatMenuDate(tomorrow)}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void setDue(endOfWeek)}>
            End of this week
            <span className="ml-auto text-xs text-muted-foreground">{formatMenuDate(endOfWeek)}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void setDue(inOneWeek)}>
            In one week
            <span className="ml-auto text-xs text-muted-foreground">{formatMenuDate(inOneWeek)}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          className="rounded-full px-2.5 py-1 hover:bg-accent disabled:opacity-50"
        >
          Labels
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          {labels === undefined ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>
          ) : labels.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No labels</div>
          ) : (
            labels.map((label) => {
              const allHave = issues.every((issue) => issue.labels.some((item) => item._id === label._id));
              return (
                <DropdownMenuItem key={label._id} onClick={() => void toggleLabel(label._id)}>
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: label.color }} />
                  {label.name}
                  {allHave ? <span className="ml-auto text-xs text-muted-foreground">All</span> : null}
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          className="rounded-full px-2.5 py-1 hover:bg-accent disabled:opacity-50"
        >
          Project
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          {projects?.map((project) => (
            <DropdownMenuItem key={project._id} onClick={() => void setProject(project._id)}>
              <span className="size-3.5 rounded-[3px]" style={{ backgroundColor: projectColor(project.key) }} />
              {project.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 hover:bg-accent disabled:opacity-50"
        onClick={() => void copyLinks()}
      >
        <Copy className="size-3.5" />
        Copy links
      </button>
      <button
        type="button"
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-destructive hover:bg-destructive/10 disabled:opacity-50"
        onClick={() => void deleteSelected()}
      >
        <Trash2 className="size-3.5" />
        Delete
      </button>
      <button
        type="button"
        className="rounded-full px-2.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={onClear}
      >
        Clear
      </button>
    </div>
  );
}
