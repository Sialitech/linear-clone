"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ISSUE_STATUSES,
  PRIORITIES,
  VIEW_GROUPS,
  VIEW_GROUP_LABELS,
  VIEW_ORDERS,
  VIEW_ORDER_LABELS,
  type AssigneeMode,
  type IssueStatus,
  type Priority,
  type ViewGroup,
  type ViewOrder,
} from "@convex/model";
import LabelChip from "@/components/label-chip";
import PriorityIcon, { priorityLabel } from "@/components/priority-icon";
import StatusIcon, { statusLabel } from "@/components/status-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
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
import { ArrowUpDown, ChevronDown, CircleUser, FolderKanban, GitBranch, List, ListFilter, SignalHigh, SlidersHorizontal, Tag, X } from "lucide-react";
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
  subGroupBy: ViewGroup | null;
  orderBy: ViewOrder | null;
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
    subGroupBy: view.subGroupBy ?? null,
    orderBy: view.orderBy ?? null,
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
  children: (layout: { groupBy: ViewGroup | null; subGroupBy: ViewGroup | null; orderBy: ViewOrder }) => ReactNode;
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
  const [openMenu, setOpenMenu] = useState<"group" | "sub" | "order" | null>(null);

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
        subGroupBy: snapshot.subGroupBy,
        orderBy: snapshot.orderBy,
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
                  <p className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Add filter</p>
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
              <Popover
                onOpenChange={(open) => {
                  if (!open) setOpenMenu(null);
                }}
              >
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
                <PopoverContent align="end" className="w-80 gap-1 overflow-visible p-2">
                  <DisplayField
                    icon={<List className="size-3.5 text-muted-foreground" />}
                    label="Grouping"
                    valueLabel={display.groupBy ? VIEW_GROUP_LABELS[display.groupBy] : "No grouping"}
                    open={openMenu === "group"}
                    onToggle={() => setOpenMenu((current) => (current === "group" ? null : "group"))}
                    options={[
                      { value: "", label: "No grouping" },
                      ...VIEW_GROUPS.map((group) => ({ value: group, label: VIEW_GROUP_LABELS[group] })),
                    ]}
                    selected={display.groupBy ?? ""}
                    onSelect={(value) => {
                      const groupBy = value === "" ? null : (value as ViewGroup);
                      commit({
                        groupBy,
                        subGroupBy: display.subGroupBy === groupBy ? null : display.subGroupBy,
                      });
                      setOpenMenu(null);
                    }}
                  />
                  <DisplayField
                    icon={<GitBranch className="size-3.5 text-muted-foreground" />}
                    label="Sub-grouping"
                    valueLabel={display.subGroupBy ? VIEW_GROUP_LABELS[display.subGroupBy] : "No grouping"}
                    open={openMenu === "sub"}
                    onToggle={() => setOpenMenu((current) => (current === "sub" ? null : "sub"))}
                    options={[
                      { value: "", label: "No grouping" },
                      ...VIEW_GROUPS.filter((group) => group !== display.groupBy).map((group) => ({
                        value: group,
                        label: VIEW_GROUP_LABELS[group],
                      })),
                    ]}
                    selected={display.subGroupBy ?? ""}
                    onSelect={(value) => {
                      commit({ subGroupBy: value === "" ? null : (value as ViewGroup) });
                      setOpenMenu(null);
                    }}
                  />
                  <DisplayField
                    icon={<ArrowUpDown className="size-3.5 text-muted-foreground" />}
                    label="Ordering"
                    valueLabel={VIEW_ORDER_LABELS[display.orderBy ?? "priority"]}
                    open={openMenu === "order"}
                    onToggle={() => setOpenMenu((current) => (current === "order" ? null : "order"))}
                    options={VIEW_ORDERS.map((order) => ({ value: order, label: VIEW_ORDER_LABELS[order] }))}
                    selected={display.orderBy ?? "priority"}
                    onSelect={(value) => {
                      commit({ orderBy: value === "priority" ? null : (value as ViewOrder) });
                      setOpenMenu(null);
                    }}
                  />
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
      {children({
        groupBy: display.groupBy,
        subGroupBy: display.subGroupBy,
        orderBy: display.orderBy ?? "priority",
      })}
    </>
  );
}

function DisplayField({
  icon,
  label,
  valueLabel,
  open,
  onToggle,
  options,
  selected,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  valueLabel: string;
  open: boolean;
  onToggle: () => void;
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-1.5 py-1">
      <span className="flex min-w-0 items-center gap-2 text-sm">
        {icon}
        {label}
      </span>
      <div className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={label}
          onClick={onToggle}
          className="inline-flex h-7 w-36 items-center justify-between gap-1 rounded-md bg-white/[0.06] px-2 text-xs hover:bg-white/10"
        >
          <span className="truncate">{valueLabel}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
        {open ? (
          <div
            role="listbox"
            aria-label={label}
            className="absolute top-8 right-0 z-20 w-40 rounded-md bg-popover p-1 shadow-lg ring-1 ring-foreground/10"
          >
            {options.map((option) => (
              <button
                key={option.value || "none"}
                type="button"
                role="option"
                aria-selected={selected === option.value}
                onClick={() => onSelect(option.value)}
                className={cn(
                  "flex h-8 w-full items-center rounded-md px-2 text-left text-sm hover:bg-white/8",
                  selected === option.value && "bg-white/8",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
