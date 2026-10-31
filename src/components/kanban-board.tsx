"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ISSUE_STATUSES, type IssueStatus } from "@convex/model";
import IssueContextMenu from "@/components/issue-context-menu";
import LabelChip from "@/components/label-chip";
import PriorityIcon from "@/components/priority-icon";
import StatusIcon, { statusLabel } from "@/components/status-icon";
import UserAvatar from "@/components/user-avatar";
import { errorMessage } from "@/lib/format";
import type { IssueItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Columns = Record<IssueStatus, IssueItem[]>;

function groupIssues(issues: IssueItem[]): Columns {
  const columns = {
    backlog: [],
    todo: [],
    in_progress: [],
    in_review: [],
    done: [],
  } as Columns;
  for (const issue of issues) columns[issue.status].push(issue);
  for (const status of ISSUE_STATUSES) {
    columns[status].sort((a, b) => a.order - b.order);
  }
  return columns;
}

function isStatus(value: string): value is IssueStatus {
  return (ISSUE_STATUSES as readonly string[]).includes(value);
}

function containerOf(columns: Columns, id: string): IssueStatus | null {
  if (isStatus(id)) return id;
  for (const status of ISSUE_STATUSES) {
    if (columns[status].some((issue) => issue._id === id)) return status;
  }
  return null;
}

function rankBetween(before: number | null, after: number | null) {
  if (before === null && after === null) return Date.now();
  if (before === null) return (after ?? 0) - 1;
  if (after === null) return before + 1;
  if (before === after) return before + 0.5;
  return (before + after) / 2;
}

function moveIssue(columns: Columns, activeId: string, overId: string): Columns {
  const from = containerOf(columns, activeId);
  const to = isStatus(overId) ? overId : containerOf(columns, overId);
  if (!from || !to) return columns;
  const fromItems = columns[from];
  const fromIndex = fromItems.findIndex((issue) => issue._id === activeId);
  if (fromIndex < 0) return columns;
  if (from === to) {
    if (isStatus(overId)) return columns;
    const toIndex = fromItems.findIndex((issue) => issue._id === overId);
    if (toIndex < 0 || toIndex === fromIndex) return columns;
    return { ...columns, [from]: arrayMove(fromItems, fromIndex, toIndex) };
  }
  const moving = { ...fromItems[fromIndex], status: to };
  const nextFrom = fromItems.filter((issue) => issue._id !== activeId);
  const toItems = columns[to];
  const overIndex = toItems.findIndex((issue) => issue._id === overId);
  const insertAt = overIndex < 0 ? toItems.length : overIndex;
  const nextTo = [...toItems.slice(0, insertAt), moving, ...toItems.slice(insertAt)];
  return { ...columns, [from]: nextFrom, [to]: nextTo };
}

export default function KanbanBoard({
  issues,
  workspaceId,
  projectId,
}: {
  issues: IssueItem[] | undefined;
  workspaceId: Id<"workspaces">;
  projectId: Id<"projects">;
}) {
  const router = useRouter();
  const [columns, setColumns] = useState<Columns>(() => groupIssues([]));
  const columnsRef = useRef(columns);
  const dragging = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const move = useMutation(api.issues.move).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.issues.list, {
      workspaceId: args.workspaceId,
      projectId: args.projectId,
    });
    if (!current) return;
    localStore.setQuery(
      api.issues.list,
      { workspaceId: args.workspaceId, projectId: args.projectId },
      current.map((issue) =>
        issue._id === args.issueId
          ? { ...issue, status: args.status, order: args.order, updatedAt: Date.now() }
          : issue,
      ),
    );
  });
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  useEffect(() => {
    if (dragging.current || !issues) return;
    const next = groupIssues(issues);
    columnsRef.current = next;
    setColumns(next);
  }, [issues]);

  function updateColumns(next: Columns) {
    columnsRef.current = next;
    setColumns(next);
  }

  function onDragStart(event: DragStartEvent) {
    dragging.current = true;
    setActiveId(String(event.active.id));
  }

  function finishDrag(event: DragEndEvent) {
    dragging.current = false;
    setActiveId(null);
    if (!event.over || !issues) return;
    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    if (activeId === overId) return;
    const current = groupIssues(issues);
    const from = containerOf(current, activeId);
    const next = moveIssue(current, activeId, overId);
    const status = containerOf(next, activeId);
    if (!from || !status) return;
    const fromIndex = current[from].findIndex((issue) => issue._id === activeId);
    const nextIndex = next[status].findIndex((issue) => issue._id === activeId);
    if (from === status && fromIndex === nextIndex) return;
    const column = next[status];
    const order = rankBetween(
      column[nextIndex - 1]?.order ?? null,
      column[nextIndex + 1]?.order ?? null,
    );
    const original = issues.find((issue) => issue._id === activeId);
    if (!original) return;
    const placed = column.map((issue, index) =>
      index === nextIndex ? { ...issue, status, order } : issue,
    );
    updateColumns({ ...next, [status]: placed });
    void move({
      issueId: original._id,
      workspaceId,
      projectId,
      status,
      order,
    }).catch((error: unknown) => {
      toast.error(errorMessage(error));
      updateColumns(groupIssues(issues));
    });
  }

  const activeIssue = activeId
    ? ISSUE_STATUSES.flatMap((status) => columns[status]).find((issue) => issue._id === activeId)
    : undefined;

  if (issues === undefined) {
    return <div className="p-4 text-sm text-muted-foreground">Loading board…</div>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={finishDrag}
      onDragCancel={() => {
        dragging.current = false;
        setActiveId(null);
        updateColumns(groupIssues(issues));
      }}
    >
      <div className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
        {ISSUE_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            issues={columns[status]}
            onOpen={(issueId) => router.push(`/issues/${issueId}`)}
          />
        ))}
      </div>
      <DragOverlay>
        {activeIssue ? <IssueCard issue={activeIssue} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  issues,
  onOpen,
}: {
  status: IssueStatus;
  issues: IssueItem[];
  onOpen: (issueId: Id<"issues">) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      className={cn(
        "flex h-full w-[min(78vw,272px)] shrink-0 snap-start flex-col rounded-lg bg-white/[0.02] md:w-[272px]",
        isOver && "bg-white/[0.04]",
      )}
    >
      <header className="flex items-center gap-2 px-2 py-2 text-[13px]">
        <StatusIcon status={status} />
        <span>{statusLabel(status)}</span>
        <span className="text-xs text-muted-foreground">{issues.length}</span>
      </header>
      <SortableContext items={issues.map((issue) => issue._id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-1.5 overflow-y-auto px-1.5 pb-2">
          {issues.map((issue) => (
            <SortableCard key={issue._id} issue={issue} onOpen={onOpen} />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCard({
  issue,
  onOpen,
}: {
  issue: IssueItem;
  onOpen: (issueId: Id<"issues">) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue._id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <IssueContextMenu issue={issue}>
        <IssueCard issue={issue} onOpen={() => onOpen(issue._id)} />
      </IssueContextMenu>
    </div>
  );
}

function IssueCard({
  issue,
  onOpen,
  overlay = false,
}: {
  issue: IssueItem;
  onOpen?: () => void;
  overlay?: boolean;
}) {
  return (
    <div
      onClick={onOpen}
      className={cn(
        "w-full rounded-md border border-border bg-card px-2.5 py-2 text-left",
        overlay && "shadow-none",
      )}
    >
      <div className="line-clamp-2 text-[13px] leading-5">{issue.title}</div>
      <div className="mt-2 flex items-center gap-1.5 text-muted-foreground">
        <span className="font-mono text-[11px]">{issue.identifier}</span>
        <PriorityIcon priority={issue.priority} className="size-3" />
        <span className="ml-auto flex items-center gap-1">
          {issue.labels.slice(0, 1).map((label) => (
            <LabelChip key={label._id} name={label.name} color={label.color} />
          ))}
          <UserAvatar user={issue.assignee} />
        </span>
      </div>
    </div>
  );
}
