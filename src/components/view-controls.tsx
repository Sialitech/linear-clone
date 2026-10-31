"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ISSUE_STATUSES,
  PRIORITIES,
  VIEW_GROUPS,
  VIEW_GROUP_LABELS,
  type AssigneeMode,
  type IssueStatus,
  type Priority,
  type ViewGroup,
} from "@convex/model";
import LabelChip from "@/components/label-chip";
import PriorityIcon, { priorityLabel } from "@/components/priority-icon";
import StatusIcon, { statusLabel } from "@/components/status-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import UserAvatar from "@/components/user-avatar";
import { errorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, CircleUser, FolderKanban, ListFilter, SignalHigh, SlidersHorizontal, Tag, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

type SavedView = NonNullable<FunctionReturnType<typeof api.views.get>>;

type ViewLayout = {
  projectId: Id<"projects"> | null;
  status: IssueStatus | null;
  priority: Priority | null;
  assigneeMode: AssigneeMode;
  assigneeId: Id<"users"> | null;
  labelId: Id<"labels"> | null;
  groupBy: ViewGroup | null;
};

function layoutOf(view: SavedView): ViewLayout {
  return {
    projectId: view.projectId ?? null,
    status: view.status ?? null,
    priority: view.priority ?? null,
    assigneeMode: view.assigneeMode,
    assigneeId: view.assigneeId ?? null,
    labelId: view.labelId ?? null,
    groupBy: view.groupBy ?? null,
  };
}

function isIssueStatus(value: string): value is IssueStatus {
  return (ISSUE_STATUSES as readonly string[]).includes(value);
}

function isPriority(value: string): value is Priority {
  return (PRIORITIES as readonly string[]).includes(value);
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
  children: (groupBy: ViewGroup | null) => ReactNode;
}) {
  const update = useMutation(api.views.update);
  const projects = useQuery(api.projects.list, { workspaceId: view.workspaceId });
  const members = useQuery(api.users.listMembers, { workspaceId: view.workspaceId });
  const labels = useQuery(api.labels.list, { workspaceId: view.workspaceId });
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
        status: snapshot.status,
        priority: snapshot.priority,
        assigneeMode: snapshot.assigneeMode,
        assigneeId: snapshot.assigneeId,
        labelId: snapshot.labelId,
        groupBy: snapshot.groupBy,
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

  const projectName = projects?.find((project) => project._id === display.projectId)?.name;
  const label = labels?.find((item) => item._id === display.labelId);
  const assignee = members?.find((member) => member._id === display.assigneeId);
  const assigneeValue =
    display.assigneeMode === "user" && display.assigneeId ? display.assigneeId : display.assigneeMode;

  const chips: { key: string; field: string; value: ReactNode; clear: Partial<ViewLayout> }[] = [];
  if (display.status) {
    chips.push({
      key: "status",
      field: "Status",
      value: statusLabel(display.status),
      clear: { status: null },
    });
  }
  if (display.priority) {
    chips.push({
      key: "priority",
      field: "Priority",
      value: priorityLabel(display.priority),
      clear: { priority: null },
    });
  }
  if (display.assigneeMode === "me") {
    chips.push({
      key: "assignee",
      field: "Assignee",
      value: "Assigned to me",
      clear: { assigneeMode: "anyone", assigneeId: null },
    });
  } else if (display.assigneeMode === "unassigned") {
    chips.push({
      key: "assignee",
      field: "Assignee",
      value: "Unassigned",
      clear: { assigneeMode: "anyone", assigneeId: null },
    });
  } else if (display.assigneeMode === "user") {
    chips.push({
      key: "assignee",
      field: "Assignee",
      value: assignee?.name || assignee?.email || "Member",
      clear: { assigneeMode: "anyone", assigneeId: null },
    });
  }
  if (display.projectId) {
    chips.push({
      key: "project",
      field: "Project",
      value: projectName ?? "Project",
      clear: { projectId: null },
    });
  }
  if (display.labelId) {
    chips.push({
      key: "label",
      field: "Label",
      value: label ? <LabelChip name={label.name} color={label.color} /> : "Label",
      clear: { labelId: null },
    });
  }

  const grouped = display.groupBy !== null;

  return (
    <>
      <div className="border-b border-border">
        <header className="flex min-h-12 items-center gap-2 px-3 sm:px-4">
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h1>
          {canEdit ? (
            <div className="flex shrink-0 items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn("h-8", chips.length > 0 && "text-foreground")}
                      aria-label="Add filter"
                    />
                  }
                >
                  <ListFilter className="size-3.5" />
                  Filter
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>Add filter</DropdownMenuLabel>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <StatusIcon status={display.status ?? "todo"} />
                      Status
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 min-w-40">
                      <DropdownMenuRadioGroup
                        value={display.status ?? "any"}
                        onValueChange={(value) => {
                          if (value === "any") commit({ status: null });
                          else if (typeof value === "string" && isIssueStatus(value)) commit({ status: value });
                        }}
                      >
                        <DropdownMenuRadioItem value="any">Any status</DropdownMenuRadioItem>
                        {ISSUE_STATUSES.map((status) => (
                          <DropdownMenuRadioItem key={status} value={status}>
                            <StatusIcon status={status} />
                            {statusLabel(status)}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <SignalHigh className="size-3.5" />
                      Priority
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 min-w-40">
                      <DropdownMenuRadioGroup
                        value={display.priority ?? "any"}
                        onValueChange={(value) => {
                          if (value === "any") commit({ priority: null });
                          else if (typeof value === "string" && isPriority(value)) commit({ priority: value });
                        }}
                      >
                        <DropdownMenuRadioItem value="any">Any priority</DropdownMenuRadioItem>
                        {PRIORITIES.map((priority) => (
                          <DropdownMenuRadioItem key={priority} value={priority}>
                            <PriorityIcon priority={priority} />
                            {priorityLabel(priority)}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <CircleUser className="size-3.5" />
                      Assignee
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 min-w-44">
                      <DropdownMenuRadioGroup
                        value={assigneeValue}
                        onValueChange={(value) => {
                          if (value === "anyone" || value === "me" || value === "unassigned") {
                            commit({ assigneeMode: value, assigneeId: null });
                            return;
                          }
                          if (typeof value === "string") {
                            commit({ assigneeMode: "user", assigneeId: value as Id<"users"> });
                          }
                        }}
                      >
                        <DropdownMenuRadioItem value="anyone">Anyone</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="me">Assigned to me</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="unassigned">Unassigned</DropdownMenuRadioItem>
                        {members?.map((member) => (
                          <DropdownMenuRadioItem key={member._id} value={member._id}>
                            <UserAvatar user={member} />
                            <span className="truncate">{member.name || member.email}</span>
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Tag className="size-3.5" />
                      Label
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 min-w-40">
                      <DropdownMenuRadioGroup
                        value={display.labelId ?? "any"}
                        onValueChange={(value) => {
                          if (value === "any") commit({ labelId: null });
                          else if (typeof value === "string") commit({ labelId: value as Id<"labels"> });
                        }}
                      >
                        <DropdownMenuRadioItem value="any">Any label</DropdownMenuRadioItem>
                        {labels?.map((item) => (
                          <DropdownMenuRadioItem key={item._id} value={item._id}>
                            <LabelChip name={item.name} color={item.color} />
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FolderKanban className="size-3.5" />
                      Project
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 min-w-44">
                      <DropdownMenuRadioGroup
                        value={display.projectId ?? "any"}
                        onValueChange={(value) => {
                          if (value === "any") commit({ projectId: null });
                          else if (typeof value === "string") commit({ projectId: value as Id<"projects"> });
                        }}
                      >
                        <DropdownMenuRadioItem value="any">Any project</DropdownMenuRadioItem>
                        {projects?.map((project) => (
                          <DropdownMenuRadioItem key={project._id} value={project._id}>
                            <span className="truncate">{project.name}</span>
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn("h-8", grouped && "text-foreground")}
                      aria-label="Display options"
                    />
                  }
                >
                  <SlidersHorizontal className="size-3.5" />
                  Display
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 gap-1 p-1.5">
                  <p className="px-2 py-1 text-xs text-muted-foreground">Grouping</p>
                  <GroupOption
                    label="No grouping"
                    selected={display.groupBy === null}
                    onSelect={() => commit({ groupBy: null })}
                  />
                  {VIEW_GROUPS.map((group) => (
                    <GroupOption
                      key={group}
                      label={VIEW_GROUP_LABELS[group]}
                      selected={display.groupBy === group}
                      onSelect={() => commit({ groupBy: group })}
                    />
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          ) : grouped ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              Grouped by {VIEW_GROUP_LABELS[display.groupBy ?? "status"].toLowerCase()}
            </span>
          ) : null}
        </header>
        {chips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 sm:px-4">
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex h-7 max-w-full items-center gap-1 rounded-md border border-border bg-white/[0.03] pr-1 pl-2 text-xs"
              >
                <span className="text-muted-foreground">{chip.field}</span>
                <span className="truncate text-foreground">{chip.value}</span>
                {canEdit ? (
                  <button
                    type="button"
                    aria-label={`Remove ${chip.field} filter`}
                    onClick={() => commit(chip.clear)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {children(display.groupBy)}
    </>
  );
}

function GroupOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex h-8 items-center justify-between rounded-md px-2 text-left text-sm hover:bg-white/5",
        selected && "bg-white/8 text-foreground",
      )}
    >
      {label}
      {selected ? <Check className="size-3.5 text-muted-foreground" /> : null}
    </button>
  );
}
