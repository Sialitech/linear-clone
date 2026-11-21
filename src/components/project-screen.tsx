"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ISSUE_STATUSES, PRIORITIES, VIEW_GROUPS, VIEW_ORDERS } from "@convex/model";
import { hasAnyFilter, toListFilters } from "@convex/lib/viewFilters";
import {
  DEFAULT_DISPLAY,
  DisplayMenu,
  EMPTY_FILTERS,
  FilterChips,
  FilterMenu,
  type DisplayState,
  type FilterState,
} from "@/components/issue-filters";
import { buildIssueGroups } from "@/components/issue-group-builder";
import IssueList from "@/components/issue-list";
import KanbanBoard from "@/components/kanban-board";
import StatusIcon from "@/components/status-icon";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sortIssues } from "@/lib/issue-groups";
import { parseProjectView, projectViewKey, pruneIds, serializeProjectView } from "@/lib/project-view-prefs";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { LayoutGrid, List, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  // Los proyectos arrancan ordenados por última actualización, como antes de tener opciones de display.
  const [display, setDisplay] = useState<DisplayState>({ ...DEFAULT_DISPLAY, orderBy: "updated" });
  // Los filtros y el display se recuerdan por proyecto en este navegador. La búsqueda no.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const restored = loadedFor === projectId;
  const members = useQuery(api.users.listMembers, workspace ? { workspaceId: workspace._id } : "skip");
  const labels = useQuery(api.labels.list, workspace ? { workspaceId: workspace._id } : "skip");

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(projectViewKey(projectId));
    } catch {}
    const stored = parseProjectView(raw, {
      statuses: ISSUE_STATUSES,
      priorities: PRIORITIES,
      groups: VIEW_GROUPS,
      orders: VIEW_ORDERS,
    });
    setFilters(stored ? ({ ...stored.filters, projectId: null } as FilterState) : EMPTY_FILTERS);
    setDisplay(stored ? (stored.display as DisplayState) : { ...DEFAULT_DISPLAY, orderBy: "updated" });
    setSearch("");
    setLoadedFor(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(projectViewKey(projectId), serializeProjectView({ filters, display }));
    } catch {}
  }, [restored, projectId, filters, display]);

  // Si una etiqueta se borró o un miembro salió, su filtro guardado ya no puede cumplirse.
  useEffect(() => {
    if (!restored || !members || !labels) return;
    const memberIds = new Set<string>(members.map((m) => m._id));
    const labelIds = new Set<string>(labels.map((l) => l._id));
    const assignees = pruneIds(filters.assignees, memberIds, ["me", "unassigned"]);
    const kept = pruneIds(filters.labelIds, labelIds);
    if (assignees.length !== filters.assignees.length || kept.length !== filters.labelIds.length) {
      setFilters((current) => ({ ...current, assignees, labelIds: kept }));
    }
  }, [restored, members, labels, filters.assignees, filters.labelIds]);

  const needsMe = filters.assignees.includes("me");
  const listArgs =
    workspace && restored && (!needsMe || me)
      ? {
          workspaceId: workspace._id,
          projectId: id,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...toListFilters(filters, me?._id),
        }
      : "skip";
  const issues = useQuery(
    api.issues.list,
    mode === "board" ? (workspace ? { workspaceId: workspace._id, projectId: id } : "skip") : listArgs,
  );
  const orderBy = display.orderBy ?? "priority";
  const ordered = useMemo(() => (issues ? sortIssues(issues, orderBy) : undefined), [issues, orderBy]);
  const listGroups = useMemo(() => {
    if (mode !== "list" || !ordered) return undefined;
    if (display.groupBy) return buildIssueGroups(ordered, display.groupBy, display.subGroupBy, orderBy);
    // Sin agrupación ni filtro de estado, lo terminado se separa al final.
    if (filters.statuses.length > 0) return undefined;
    const open = ordered.filter((issue) => issue.status !== "done");
    const done = ordered.filter((issue) => issue.status === "done");
    if (done.length === 0) return undefined;
    return [
      { key: "open", label: "", issues: open },
      { key: "done", label: "Done", icon: <StatusIcon status="done" />, issues: done },
    ];
  }, [ordered, mode, display.groupBy, display.subGroupBy, orderBy, filters.statuses.length]);

  if (project === null) {
    return <div className="p-6 text-sm text-muted-foreground">Project not found.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-12 items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium">
            {project ? (
              <>
                {project.name}
                {project.key ? (
                  <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{project.key}</span>
                ) : null}
              </>
            ) : (
              <span className="inline-block h-3.5 w-32 animate-pulse rounded-md bg-muted align-middle" />
            )}
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
              "inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-accent sm:h-7",
              mode === "list" && "bg-muted text-foreground",
            )}
          >
            <List className="size-3.5" />
            <span className="hidden sm:inline">List</span>
          </Link>
          <Link
            href={`/projects/${projectId}/board`}
            aria-label="Board"
            className={cn(
              "inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-accent sm:h-7",
              mode === "board" && "bg-muted text-foreground",
            )}
          >
            <LayoutGrid className="size-3.5" />
            <span className="hidden sm:inline">Board</span>
          </Link>
        </div>
      </header>
      {mode === "list" && workspace ? (
        <div className="border-b border-border">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search issues"
              className="h-9 w-full sm:h-7 sm:w-48"
            />
            <div className="ml-auto flex items-center gap-1">
              <FilterMenu
                workspaceId={workspace._id}
                filters={filters}
                onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
                showProject={false}
              />
              <DisplayMenu
                display={display}
                onChange={(patch) => setDisplay((current) => ({ ...current, ...patch }))}
              />
            </div>
          </div>
          <FilterChips
            workspaceId={workspace._id}
            filters={filters}
            onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
            showProject={false}
          />
        </div>
      ) : null}
      {mode === "board" && workspace ? (
        <KanbanBoard issues={issues} workspaceId={workspace._id} projectId={id} />
      ) : (
        <IssueList
          issues={mode === "list" ? ordered : issues}
          preserveOrder
          groups={listGroups}
          empty={
            search.trim() || hasAnyFilter(filters) ? "No issues match these filters." : "No issues in this project."
          }
          showSubIssues={display.showSubIssues}
        />
      )}
    </div>
  );
}
