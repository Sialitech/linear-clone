"use client";

import IssueContextMenu from "@/components/issue-context-menu";
import IssueSelectionBar from "@/components/issue-selection-bar";
import LabelChip from "@/components/label-chip";
import PriorityIcon, { priorityLabel } from "@/components/priority-icon";
import StatusIcon, { statusLabel } from "@/components/status-icon";
import UserAvatar from "@/components/user-avatar";
import { formatDue, isOverdue } from "@/lib/format";
import { selectionAfterClick, selectionAfterSelectAll, type SelectionState } from "@/lib/issue-selection";
import type { IssueItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type MouseEvent } from "react";

const emptySelection: SelectionState = { selected: [], anchorId: null };

const tableRow =
  "hidden items-center gap-2 px-4 py-2 text-[13px] md:grid md:grid-cols-[1.75rem_4.75rem_minmax(0,1fr)_2.25rem_7.5rem_6.5rem_4.25rem] lg:grid-cols-[1.75rem_5.5rem_minmax(0,1fr)_2.25rem_8.25rem_6.75rem_9rem_4.25rem]";

export default function IssueList({
  issues,
  empty,
}: {
  issues: IssueItem[] | undefined;
  empty: string;
}) {
  const [selection, setSelection] = useState<SelectionState>(emptySelection);

  const rows = useMemo(
    () => (issues === undefined ? [] : [...issues].sort((a, b) => b.updatedAt - a.updatedAt)),
    [issues],
  );
  const orderedIds = useMemo(() => rows.map((issue) => issue._id), [rows]);
  const orderKey = orderedIds.join("|");
  const selected = new Set(selection.selected);
  const selectedCount = rows.filter((issue) => selected.has(issue._id)).length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSelection(emptySelection);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setSelection((current) => {
      const live = new Set<string>(orderedIds);
      const nextSelected = current.selected.filter((id) => live.has(id));
      const anchorId = current.anchorId && live.has(current.anchorId) ? current.anchorId : null;
      if (nextSelected.length === current.selected.length && anchorId === current.anchorId) return current;
      return { selected: nextSelected, anchorId };
    });
  }, [orderKey, orderedIds]);

  if (issues === undefined) {
    return <div className="px-4 py-8 text-sm text-muted-foreground">Loading issues…</div>;
  }
  if (rows.length === 0) {
    return <div className="px-4 py-16 text-center text-sm text-muted-foreground">{empty}</div>;
  }

  function selectAt(issueId: string, modifiers: { shiftKey: boolean; toggleKey: boolean }) {
    setSelection((current) => selectionAfterClick(orderedIds, current, issueId, modifiers));
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)]">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase md:hidden">
        <IssueCheckbox
          checked={allSelected}
          indeterminate={selectedCount > 0 && !allSelected}
          label={allSelected ? "Clear selection" : "Select all issues"}
          onClick={() => setSelection(selectionAfterSelectAll(orderedIds, allSelected))}
        />
        <span>Select</span>
      </div>
      <div
        className={cn(
          tableRow,
          "sticky top-0 z-10 border-b border-border bg-background text-[11px] font-medium tracking-wide text-muted-foreground uppercase",
        )}
      >
        <span className="flex justify-center">
          <IssueCheckbox
            checked={allSelected}
            indeterminate={selectedCount > 0 && !allSelected}
            label={allSelected ? "Clear selection" : "Select all issues"}
            onClick={() => setSelection(selectionAfterSelectAll(orderedIds, allSelected))}
          />
        </span>
        <span>ID</span>
        <span>Title</span>
        <span />
        <span>Status</span>
        <span>Priority</span>
        <span className="hidden lg:block">Labels</span>
        <span>Due</span>
      </div>
      {rows.map((issue) => {
        const isSelected = selected.has(issue._id);
        return (
          <IssueContextMenu key={issue._id} issue={issue} enableTouchMenu>
            <div
              className={cn(
                "border-b border-border/70",
                isSelected && "bg-primary/10",
              )}
            >
              <div className="flex items-start gap-2 px-3 py-3 sm:px-4 md:hidden">
                <IssueCheckbox
                  checked={isSelected}
                  label={isSelected ? `Deselect ${issue.identifier}` : `Select ${issue.identifier}`}
                  onClick={(event) => {
                    event.preventDefault();
                    selectAt(issue._id, {
                      shiftKey: event.shiftKey,
                      toggleKey: event.metaKey || event.ctrlKey,
                    });
                  }}
                />
                <Link href={`/issues/${issue._id}`} className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <StatusIcon status={issue.status} className="mt-0.5 size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 text-[15px] leading-5 text-foreground">{issue.title}</span>
                    <UserAvatar user={issue.assignee} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-5 text-xs text-muted-foreground">
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
                </Link>
              </div>
              <Link
                href={`/issues/${issue._id}`}
                onClick={(event) => {
                  if (event.shiftKey || event.metaKey || event.ctrlKey) {
                    event.preventDefault();
                    selectAt(issue._id, {
                      shiftKey: event.shiftKey,
                      toggleKey: event.metaKey || event.ctrlKey,
                    });
                  }
                }}
                className={cn(tableRow, "select-none hover:bg-white/[0.03]", isSelected && "hover:bg-primary/15")}
              >
                <span className="flex justify-center">
                  <IssueCheckbox
                    checked={isSelected}
                    label={isSelected ? `Deselect ${issue.identifier}` : `Select ${issue.identifier}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      selectAt(issue._id, {
                        shiftKey: event.shiftKey,
                        toggleKey: event.metaKey || event.ctrlKey,
                      });
                    }}
                  />
                </span>
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
              </Link>
            </div>
          </IssueContextMenu>
        );
      })}
      {selectedCount > 0 ? (
        <IssueSelectionBar
          issueIds={rows.filter((issue) => selected.has(issue._id)).map((issue) => issue._id)}
          onClear={() => setSelection(emptySelection)}
        />
      ) : null}
    </div>
  );
}

function IssueCheckbox({
  checked,
  indeterminate,
  label,
  onClick,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
        checked || indeterminate
          ? "border-primary bg-primary text-primary-foreground"
          : "border-muted-foreground/50 bg-transparent text-transparent hover:border-foreground",
      )}
    >
      {indeterminate ? (
        <span className="h-0.5 w-2 rounded-full bg-primary-foreground" />
      ) : (
        <Check className="size-3" strokeWidth={3} />
      )}
    </button>
  );
}
