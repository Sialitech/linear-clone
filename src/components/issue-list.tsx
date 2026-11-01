"use client";

import { api } from "@convex/_generated/api";
import IssueContextMenu from "@/components/issue-context-menu";
import IssueSelectionBar from "@/components/issue-selection-bar";
import LabelChip from "@/components/label-chip";
import SubIssueProgress from "@/components/sub-issue-progress";
import PriorityIcon from "@/components/priority-icon";
import StatusPicker from "@/components/status-picker";
import UserAvatar from "@/components/user-avatar";
import { errorMessage, formatDue, isOverdue } from "@/lib/format";
import { selectionAfterClick, type SelectionState } from "@/lib/issue-selection";
import { nestIssues } from "@/lib/issue-tree";
import type { IssueItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useMutation } from "convex/react";
import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { toast } from "sonner";

const emptySelection: SelectionState = { selected: [], anchorId: null };

export type IssueListGroup = {
  key: string;
  label: string;
  icon?: ReactNode;
  issues: IssueItem[];
  groups?: IssueListGroup[];
};

export default function IssueList({
  issues,
  empty,
  nested = false,
  groups,
  preserveOrder = false,
  showSubIssues = true,
}: {
  issues: IssueItem[] | undefined;
  empty: string;
  /** When true, omit outer scroll so a parent can scroll multiple lists. */
  nested?: boolean;
  /** When set, issues render under these group headers instead of one flat list. */
  groups?: IssueListGroup[];
  /** Keep the incoming issue order instead of sorting by last update. */
  preserveOrder?: boolean;
  /** Indent children under their parent. When false, children stay hidden if the parent is listed. */
  showSubIssues?: boolean;
}) {
  const setParent = useMutation(api.issues.setParent);
  const [selection, setSelection] = useState<SelectionState>(emptySelection);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const sections = useMemo(() => {
    if (groups) return groups.filter((group) => group.issues.length > 0);
    if (!issues) return [];
    return [
      {
        key: "all",
        label: "",
        issues: preserveOrder ? [...issues] : [...issues].sort((a, b) => b.updatedAt - a.updatedAt),
      },
    ];
  }, [groups, issues, preserveOrder]);
  const rows = useMemo(
    () =>
      sections.flatMap((section) =>
        section.groups && section.groups.length > 0
          ? section.groups.flatMap((group) => nestIssues(group.issues, showSubIssues).map((row) => row.issue))
          : nestIssues(section.issues, showSubIssues).map((row) => row.issue),
      ),
    [sections, showSubIssues],
  );
  const orderedIds = useMemo(() => rows.map((issue) => issue._id), [rows]);
  const orderKey = orderedIds.join("|");
  const selected = new Set(selection.selected);
  const selectedCount = rows.filter((issue) => selected.has(issue._id)).length;

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

  async function dropOn(parentId: string, event: DragEvent) {
    event.preventDefault();
    setDragOverId(null);
    const issueId = event.dataTransfer.getData("text/plain");
    if (!issueId || issueId === parentId) return;
    try {
      await setParent({ issueId: issueId as IssueItem["_id"], parentId: parentId as IssueItem["_id"] });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function toggleGroup(key: string) {
    setCollapsed((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  return (
    <div
      className={cn(
        "relative",
        !nested && "min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)]",
      )}
    >
      {sections.map((section) => {
        const isCollapsed = collapsed.includes(section.key);
        return (
          <div key={section.key}>
            {section.label ? (
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() => toggleGroup(section.key)}
                className="flex w-full items-center gap-2 border-b border-border/70 bg-background px-3 py-2 text-left hover:bg-white/[0.03] sm:px-4"
              >
                <ChevronRight
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                    !isCollapsed && "rotate-90",
                  )}
                />
                {section.icon}
                <span className="truncate text-[13px] font-medium text-foreground">{section.label}</span>
                <span className="text-xs text-muted-foreground">{section.issues.length}</span>
              </button>
            ) : null}
            {isCollapsed ? null : section.groups && section.groups.length > 0 ? (
              section.groups.map((subgroup) => {
                const subgroupCollapsed = collapsed.includes(subgroup.key);
                return (
                  <div key={subgroup.key}>
                    <button
                      type="button"
                      aria-expanded={!subgroupCollapsed}
                      onClick={() => toggleGroup(subgroup.key)}
                      className="flex w-full items-center gap-2 border-b border-border/70 bg-background py-1.5 pr-3 pl-8 text-left hover:bg-white/[0.03] sm:pr-4 sm:pl-10"
                    >
                      <ChevronRight
                        className={cn(
                          "size-3.5 shrink-0 text-muted-foreground transition-transform",
                          !subgroupCollapsed && "rotate-90",
                        )}
                      />
                      {subgroup.icon}
                      <span className="truncate text-[13px] text-foreground">{subgroup.label}</span>
                      <span className="text-xs text-muted-foreground">{subgroup.issues.length}</span>
                    </button>
                    {subgroupCollapsed
                      ? null
                      : nestIssues(subgroup.issues, showSubIssues).map(({ issue, depth }) => {
                          const isSelected = selected.has(issue._id);
                          return (
                            <IssueContextMenu key={issue._id} issue={issue} enableTouchMenu>
                              <IssueRows
                                issue={issue}
                                depth={depth}
                                isSelected={isSelected}
                                dragOver={dragOverId === issue._id}
                                selectAt={selectAt}
                                onDragOverIssue={setDragOverId}
                                onDropIssue={(event) => void dropOn(issue._id, event)}
                              />
                            </IssueContextMenu>
                          );
                        })}
                  </div>
                );
              })
            ) : (
              nestIssues(section.issues, showSubIssues).map(({ issue, depth }) => {
                const isSelected = selected.has(issue._id);
                return (
                  <IssueContextMenu key={issue._id} issue={issue} enableTouchMenu>
                    <IssueRows
                      issue={issue}
                      depth={depth}
                      isSelected={isSelected}
                      dragOver={dragOverId === issue._id}
                      selectAt={selectAt}
                      onDragOverIssue={setDragOverId}
                      onDropIssue={(event) => void dropOn(issue._id, event)}
                    />
                  </IssueContextMenu>
                );
              })
            )}
          </div>
        );
      })}
      {selectedCount > 0 ? (
        <IssueSelectionBar
          issues={rows.filter((issue) => selected.has(issue._id))}
          onClear={() => setSelection(emptySelection)}
        />
      ) : null}
    </div>
  );
}

function IssueRows({
  issue,
  depth,
  isSelected,
  dragOver,
  selectAt,
  onDragOverIssue,
  onDropIssue,
}: {
  issue: IssueItem;
  depth: number;
  isSelected: boolean;
  dragOver: boolean;
  selectAt: (issueId: string, modifiers: { shiftKey: boolean; toggleKey: boolean }) => void;
  onDragOverIssue: (issueId: string | null) => void;
  onDropIssue: (event: DragEvent) => void;
}) {
  const indent = depth * 20;

  function onDragStart(event: DragEvent) {
    event.dataTransfer.setData("text/plain", issue._id);
    event.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(event: DragEvent) {
    if (!event.dataTransfer.types.includes("text/plain")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    onDragOverIssue(issue._id);
  }

  return (
    <div
      className={cn(
        "border-b border-border/70",
        isSelected && "bg-primary/10",
        dragOver && "bg-primary/15",
      )}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={() => onDragOverIssue(null)}
      onDrop={onDropIssue}
    >
      <div
        className="flex items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-white/[0.03] sm:px-4"
        style={{ paddingLeft: 12 + indent }}
      >
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
        <PriorityIcon priority={issue.priority} />
        <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{issue.identifier}</span>
        {depth > 0 ? <TreeMark /> : null}
        <StatusPicker issueId={issue._id} status={issue.status} />
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
          className="min-w-0 flex-1 truncate text-foreground"
        >
          {issue.title}
        </Link>
        <SubIssueProgress done={issue.subIssues.done} total={issue.subIssues.total} />
        <span className="hidden min-w-0 items-center gap-1 sm:flex">
          {issue.labels.slice(0, 2).map((label) => (
            <LabelChip key={label._id} name={label.name} color={label.color} />
          ))}
        </span>
        {issue.dueDate ? (
          <span
            className={cn(
              "hidden shrink-0 text-xs text-muted-foreground sm:inline",
              isOverdue(issue.dueDate, issue.status) && "text-destructive",
            )}
          >
            {formatDue(issue.dueDate)}
          </span>
        ) : null}
        <UserAvatar user={issue.assignee} />
      </div>
    </div>
  );
}

function TreeMark() {
  return <span aria-hidden className="inline-block size-3 shrink-0 rounded-bl-sm border-b border-l border-muted-foreground/40" />;
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
