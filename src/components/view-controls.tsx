"use client";

import { api } from "@convex/_generated/api";
import { normalizeFilters } from "@convex/lib/viewFilters";
import { VIEW_GROUP_LABELS, type ViewGroup, type ViewOrder } from "@convex/model";
import {
  DisplayMenu,
  FilterChips,
  FilterMenu,
  type DisplayState,
  type FilterState,
} from "@/components/issue-filters";
import { errorMessage } from "@/lib/format";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

type SavedView = NonNullable<FunctionReturnType<typeof api.views.get>>;

type ViewLayout = FilterState & DisplayState;

function layoutOf(view: SavedView): ViewLayout {
  const filters = normalizeFilters(view);
  return {
    projectId: view.projectId ?? null,
    statuses: filters.statuses,
    priorities: filters.priorities,
    assignees: filters.assignees,
    labelIds: filters.labelIds,
    groupBy: view.groupBy ?? null,
    subGroupBy: view.subGroupBy ?? null,
    orderBy: view.orderBy ?? null,
    showSubIssues: view.showSubIssues !== false,
  };
}

export default function ViewControls({
  view,
  canEdit,
  title,
  children,
}: {
  view: SavedView;
  canEdit: boolean;
  title: string;
  children: (layout: {
    groupBy: ViewGroup | null;
    subGroupBy: ViewGroup | null;
    orderBy: ViewOrder;
    showSubIssues: boolean;
  }) => ReactNode;
}) {
  const update = useMutation(api.views.update);
  const server = layoutOf(view);
  const serverKey = JSON.stringify(server);
  const latest = useRef(server);
  const sentKey = useRef<string | null>(null);
  const sending = useRef(false);
  const dirty = useRef(false);
  const [display, setDisplay] = useState(server);

  useEffect(() => {
    if (sending.current || dirty.current) return;
    if (sentKey.current && sentKey.current !== serverKey) return;
    sentKey.current = null;
    const next = layoutOf(view);
    latest.current = next;
    setDisplay(next);
  }, [serverKey, view]);

  async function flush() {
    if (sending.current) {
      dirty.current = true;
      return;
    }
    sending.current = true;
    dirty.current = false;
    const snapshot = latest.current;
    sentKey.current = JSON.stringify(snapshot);
    try {
      await update({
        viewId: view._id,
        projectId: snapshot.projectId,
        statuses: snapshot.statuses,
        priorities: snapshot.priorities,
        assignees: snapshot.assignees,
        labelIds: snapshot.labelIds,
        groupBy: snapshot.groupBy,
        subGroupBy: snapshot.subGroupBy,
        orderBy: snapshot.orderBy,
        showSubIssues: snapshot.showSubIssues,
      });
    } catch (error) {
      sentKey.current = null;
      latest.current = layoutOf(view);
      setDisplay(layoutOf(view));
      dirty.current = false;
      toast.error(errorMessage(error));
    } finally {
      sending.current = false;
      if (dirty.current) void flush();
    }
  }

  function commit(patch: Partial<ViewLayout>) {
    if (!canEdit) return;
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setDisplay(next);
    void flush();
  }

  const grouped = display.groupBy !== null;

  return (
    <>
      <div className="border-b border-border">
        <header className="flex min-h-12 items-center gap-2 px-3 sm:px-4">
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h1>
          {canEdit ? (
            <div className="flex shrink-0 items-center gap-1">
              <FilterMenu
                workspaceId={view.workspaceId}
                filters={display}
                onChange={commit}
                showProject
              />
              <DisplayMenu display={display} onChange={commit} />
            </div>
          ) : grouped ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              Grouped by {VIEW_GROUP_LABELS[display.groupBy ?? "status"].toLowerCase()}
            </span>
          ) : null}
        </header>
        <FilterChips
          workspaceId={view.workspaceId}
          filters={display}
          onChange={commit}
          showProject
          editable={canEdit}
        />
      </div>
      {children({
        groupBy: display.groupBy,
        subGroupBy: display.subGroupBy,
        orderBy: display.orderBy ?? "priority",
        showSubIssues: display.showSubIssues,
      })}
    </>
  );
}
