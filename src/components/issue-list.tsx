"use client";

import LabelChip from "@/components/label-chip";
import PriorityIcon, { priorityLabel } from "@/components/priority-icon";
import StatusIcon, { statusLabel } from "@/components/status-icon";
import UserAvatar from "@/components/user-avatar";
import { formatDue, isOverdue } from "@/lib/format";
import type { IssueItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import Link from "next/link";

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
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="sticky top-0 z-10 grid grid-cols-[88px_minmax(0,1fr)_36px_132px_110px_160px_72px] gap-2 border-b border-border bg-background px-4 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <span>ID</span>
        <span>Title</span>
        <span />
        <span>Status</span>
        <span>Priority</span>
        <span className="hidden lg:block">Labels</span>
        <span>Due</span>
      </div>
      {rows.map((issue) => (
        <Link
          key={issue._id}
          href={`/issues/${issue._id}`}
          className="grid grid-cols-[88px_minmax(0,1fr)_36px_132px_110px_160px_72px] items-center gap-2 border-b border-border/70 px-4 py-2 text-[13px] hover:bg-white/[0.03]"
        >
          <span className="font-mono text-xs text-muted-foreground">{issue.identifier}</span>
          <span className="truncate text-foreground">{issue.title}</span>
          <span className="flex justify-center">
            <UserAvatar user={issue.assignee} />
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <StatusIcon status={issue.status} />
            <span className="truncate">{statusLabel(issue.status)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <PriorityIcon priority={issue.priority} />
            <span className="truncate">{priorityLabel(issue.priority)}</span>
          </span>
          <span className="hidden items-center gap-1 lg:flex">
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
        </Link>
      ))}
    </div>
  );
}
