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
import { errorMessage } from "@/lib/format";
import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function IssueSelectionBar({
  issueIds,
  onClear,
}: {
  issueIds: Id<"issues">[];
  onClear: () => void;
}) {
  const { workspace } = useWorkspace();
  const members = useQuery(
    api.users.listMembers,
    workspace ? { workspaceId: workspace._id } : "skip",
  );
  const update = useMutation(api.issues.update);
  const remove = useMutation(api.issues.remove);
  const [busy, setBusy] = useState(false);
  const count = issueIds.length;

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

  async function setStatus(status: IssueStatus) {
    await run(async () => {
      await Promise.all(issueIds.map((issueId) => update({ issueId, status })));
    }, `Status updated on ${count}`);
  }

  async function setPriority(priority: Priority) {
    await run(async () => {
      await Promise.all(issueIds.map((issueId) => update({ issueId, priority })));
    }, `Priority updated on ${count}`);
  }

  async function setAssignee(assigneeId: Id<"users"> | null) {
    await run(async () => {
      await Promise.all(issueIds.map((issueId) => update({ issueId, assigneeId })));
    }, assigneeId ? `Assigned ${count}` : `Unassigned ${count}`);
  }

  async function deleteSelected() {
    if (!window.confirm(`Delete ${count} issue${count === 1 ? "" : "s"}?`)) return;
    await run(async () => {
      await Promise.all(issueIds.map((issueId) => remove({ issueId })));
    }, `Deleted ${count}`);
  }

  return (
    <div className="sticky bottom-4 z-20 mx-auto mt-3 flex w-fit items-center gap-1 rounded-full border border-border bg-popover px-2 py-1 text-sm shadow-lg">
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
