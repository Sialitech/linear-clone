"use client";

import IssueContextMenu from "@/components/issue-context-menu";
import LabelChip from "@/components/label-chip";
import PriorityIcon, { priorityLabel } from "@/components/priority-icon";
import StatusIcon, { statusLabel } from "@/components/status-icon";
import UserAvatar from "@/components/user-avatar";
import { formatDue, isOverdue } from "@/lib/format";
import type { IssueItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import Link from "next/link";

const tableRow =
  "hidden items-center gap-2 px-4 py-2 text-[13px] md:grid md:grid-cols-[4.75rem_minmax(0,1fr)_2.25rem_7.5rem_6.5rem_4.25rem] lg:grid-cols-[5.5rem_minmax(0,1fr)_2.25rem_8.25rem_6.75rem_9rem_4.25rem]";

export default function IssueList({
  issues,
  empty,
}: {
  issues: IssueItem[] | undefined;
  empty: string;
}) {
  if (issues === undefined) {
    return <div className="px-4 py-8 text-sm text-muted-foreground">Loading issues…</div>;
  }
  const rows = [...issues].sort((a, b) => b.updatedAt - a.updatedAt);
  if (rows.length === 0) {
    return <div className="px-4 py-16 text-center text-sm text-muted-foreground">{empty}</div>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)]">
      <div className={cn(tableRow, "sticky top-0 z-10 border-b border-border bg-background text-[11px] font-medium tracking-wide text-muted-foreground uppercase")}>
        <span>ID</span>
        <span>Title</span>
        <span />
        <span>Status</span>
        <span>Priority</span>
        <span className="hidden lg:block">Labels</span>
        <span>Due</span>
      </div>
      {rows.map((issue) => (
        <IssueContextMenu key={issue._id} issue={issue} enableTouchMenu>
          <Link
            href={`/issues/${issue._id}`}
            className="block border-b border-border/70 hover:bg-white/[0.03]"
          >
            <div className="flex flex-col gap-1.5 px-3 py-3 sm:px-4 md:hidden">
              <div className="flex items-start gap-2">
                <StatusIcon status={issue.status} className="mt-0.5 size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 text-[15px] leading-5 text-foreground">{issue.title}</span>
                <UserAvatar user={issue.assignee} />
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-5 text-xs text-muted-foreground">
                <span className="font-mono">{issue.identifier}</span>
                <span className="inline-flex items-center gap-1">
                  <PriorityIcon priority={issue.priority} />
                  {priorityLabel(issue.priority)}
                </span>
                <span>{statusLabel(issue.status)}</span>
                {issue.dueDate ? (
                  <span className={cn(isOverdue(issue.dueDate, issue.status) && "text-destructive")}>
                    {formatDue(issue.dueDate)}
                  </span>
                ) : null}
                {issue.labels.slice(0, 2).map((label) => (
                  <LabelChip key={label._id} name={label.name} color={label.color} />
                ))}
              </div>
            </div>
            <div className={tableRow}>
              <span className="font-mono text-xs text-muted-foreground">{issue.identifier}</span>
              <span className="truncate text-foreground">{issue.title}</span>
              <span className="flex justify-center">
                <UserAvatar user={issue.assignee} />
              </span>
              <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <StatusIcon status={issue.status} />
                <span className="truncate">{statusLabel(issue.status)}</span>
              </span>
              <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <PriorityIcon priority={issue.priority} />
                <span className="truncate">{priorityLabel(issue.priority)}</span>
              </span>
              <span className="hidden min-w-0 items-center gap-1 lg:flex">
                {issue.labels.slice(0, 2).map((label) => (
                  <LabelChip key={label._id} name={label.name} color={label.color} />
                ))}
              </span>
              <span
                className={cn(
                  "text-xs text-muted-foreground",
                  issue.dueDate && isOverdue(issue.dueDate, issue.status) && "text-destructive",
                )}
              >
                {issue.dueDate ? formatDue(issue.dueDate) : ""}
              </span>
            </div>
          </Link>
        </IssueContextMenu>
      ))}
    </div>
  );
}
