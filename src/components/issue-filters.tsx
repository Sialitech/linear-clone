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
  type IssueStatus,
  type Priority,
  type ViewGroup,
  type ViewOrder,
} from "@convex/model";
import { toggleValue, type AssigneeRef } from "@convex/lib/viewFilters";
import LabelChip from "@/components/label-chip";
import PriorityIcon, { priorityLabel } from "@/components/priority-icon";
import StatusIcon, { statusLabel } from "@/components/status-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  ArrowUpDown,
  ChevronDown,
  CircleUser,
  FolderKanban,
  GitBranch,
  List,
  ListFilter,
  SignalHigh,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";

export type FilterState = {
  projectId: Id<"projects"> | null;
  statuses: IssueStatus[];
  priorities: Priority[];
  assignees: AssigneeRef<Id<"users">>[];
  labelIds: Id<"labels">[];
};

export type DisplayState = {
  groupBy: ViewGroup | null;
  subGroupBy: ViewGroup | null;
  orderBy: ViewOrder | null;
  showSubIssues: boolean;
};

export const EMPTY_FILTERS: FilterState = {
  projectId: null,
  statuses: [],
  priorities: [],
  assignees: [],
  labelIds: [],
};

export const DEFAULT_DISPLAY: DisplayState = {
  groupBy: null,
  subGroupBy: null,
  orderBy: null,
  showSubIssues: true,
};

export function activeFilterCount(filters: FilterState) {
  return (
    (filters.projectId ? 1 : 0) +
    (filters.statuses.length > 0 ? 1 : 0) +
    (filters.priorities.length > 0 ? 1 : 0) +
    (filters.assignees.length > 0 ? 1 : 0) +
    (filters.labelIds.length > 0 ? 1 : 0)
  );
}

export function FilterMenu({
  workspaceId,
  filters,
  onChange,
  showProject,
}: {
  workspaceId: Id<"workspaces">;
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  showProject: boolean;
}) {
  const projects = useQuery(api.projects.list, showProject ? { workspaceId } : "skip");
  const members = useQuery(api.users.listMembers, { workspaceId });
  const labels = useQuery(api.labels.list, { workspaceId });
  const active = activeFilterCount(filters) > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-9 sm:h-8", active && "text-foreground")}
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
            <StatusIcon status={filters.statuses[0] ?? "todo"} />
            Status
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 min-w-40">
            {ISSUE_STATUSES.map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={filters.statuses.includes(status)}
                onCheckedChange={() => onChange({ statuses: toggleValue(filters.statuses, status) })}
              >
                <StatusIcon status={status} />
                {statusLabel(status)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SignalHigh className="size-3.5" />
            Priority
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 min-w-40">
            {PRIORITIES.map((priority) => (
              <DropdownMenuCheckboxItem
                key={priority}
                checked={filters.priorities.includes(priority)}
                onCheckedChange={() => onChange({ priorities: toggleValue(filters.priorities, priority) })}
              >
                <PriorityIcon priority={priority} />
                {priorityLabel(priority)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CircleUser className="size-3.5" />
            Assignee
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 min-w-44">
            <DropdownMenuCheckboxItem
              checked={filters.assignees.includes("me")}
              onCheckedChange={() => onChange({ assignees: toggleValue(filters.assignees, "me") })}
            >
              Assigned to me
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={filters.assignees.includes("unassigned")}
              onCheckedChange={() => onChange({ assignees: toggleValue(filters.assignees, "unassigned") })}
            >
              Unassigned
            </DropdownMenuCheckboxItem>
            {members?.map((member) => (
              <DropdownMenuCheckboxItem
                key={member._id}
                checked={filters.assignees.includes(member._id)}
                onCheckedChange={() => onChange({ assignees: toggleValue(filters.assignees, member._id) })}
              >
                <UserAvatar user={member} />
                <span className="truncate">{member.name || member.email}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Tag className="size-3.5" />
            Label
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 min-w-40">
            {labels?.length === 0 ? (
              <p className="px-1.5 py-1 text-xs text-muted-foreground">No labels yet</p>
            ) : null}
            {labels?.map((item) => (
              <DropdownMenuCheckboxItem
                key={item._id}
                checked={filters.labelIds.includes(item._id)}
                onCheckedChange={() => onChange({ labelIds: toggleValue(filters.labelIds, item._id) })}
              >
                <LabelChip name={item.name} color={item.color} />
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {showProject ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderKanban className="size-3.5" />
              Project
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 min-w-44">
              <DropdownMenuRadioGroup
                value={filters.projectId ?? "any"}
                onValueChange={(value) => {
                  if (value === "any") onChange({ projectId: null });
                  else if (typeof value === "string") onChange({ projectId: value as Id<"projects"> });
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
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Chip = { key: string; field: string; value: ReactNode; clear: Partial<FilterState> };

export function FilterChips({
  workspaceId,
  filters,
  onChange,
  showProject,
  editable = true,
}: {
  workspaceId: Id<"workspaces">;
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  showProject: boolean;
  editable?: boolean;
}) {
  const projects = useQuery(api.projects.list, showProject && filters.projectId ? { workspaceId } : "skip");
  const members = useQuery(api.users.listMembers, filters.assignees.length > 0 ? { workspaceId } : "skip");
  const labels = useQuery(api.labels.list, filters.labelIds.length > 0 ? { workspaceId } : "skip");

  const chips: Chip[] = [];
  if (filters.statuses.length > 0) {
    chips.push({
      key: "status",
      field: "Status",
      value: filters.statuses.map(statusLabel).join(", "),
      clear: { statuses: [] },
    });
  }
  if (filters.priorities.length > 0) {
    chips.push({
      key: "priority",
      field: "Priority",
      value: filters.priorities.map(priorityLabel).join(", "),
      clear: { priorities: [] },
    });
  }
  if (filters.assignees.length > 0) {
    chips.push({
      key: "assignee",
      field: "Assignee",
      value: filters.assignees
        .map((ref) => {
          if (ref === "me") return "Me";
          if (ref === "unassigned") return "Unassigned";
          const member = members?.find((item) => item._id === ref);
          return member?.name || member?.email || "Member";
        })
        .join(", "),
      clear: { assignees: [] },
    });
  }
  if (filters.labelIds.length > 0) {
    chips.push({
      key: "label",
      field: "Label",
      value: (
        <span className="inline-flex flex-wrap items-center gap-1">
          {filters.labelIds.map((id) => {
            const label = labels?.find((item) => item._id === id);
            return label ? <LabelChip key={id} name={label.name} color={label.color} /> : <span key={id}>Label</span>;
          })}
        </span>
      ),
      clear: { labelIds: [] },
    });
  }
  if (showProject && filters.projectId) {
    chips.push({
      key: "project",
      field: "Project",
      value: projects?.find((project) => project._id === filters.projectId)?.name ?? "Project",
      clear: { projectId: null },
    });
  }

  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 sm:px-4">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-md border border-border bg-muted/50 pr-1 pl-2 text-xs"
        >
          <span className="text-muted-foreground">{chip.field}</span>
          <span className="truncate text-foreground">{chip.value}</span>
          {editable ? (
            <button
              type="button"
              aria-label={`Remove ${chip.field} filter`}
              onClick={() => onChange(chip.clear)}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}

export function DisplayMenu({
  display,
  onChange,
}: {
  display: DisplayState;
  onChange: (patch: Partial<DisplayState>) => void;
}) {
  const [openMenu, setOpenMenu] = useState<"group" | "sub" | "order" | null>(null);
  const grouped = display.groupBy !== null;

  return (
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
            className={cn("h-9 sm:h-8", grouped && "text-foreground")}
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
            onChange({
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
            onChange({ subGroupBy: value === "" ? null : (value as ViewGroup) });
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
            onChange({ orderBy: value === "priority" ? null : (value as ViewOrder) });
            setOpenMenu(null);
          }}
        />
        <label className="flex h-8 items-center gap-2 rounded-md px-2 text-[13px]">
          <GitBranch className="size-3.5 text-muted-foreground" />
          <span className="flex-1">Show sub-issues</span>
          <input
            type="checkbox"
            className="size-3.5 accent-foreground"
            checked={display.showSubIssues}
            onChange={(event) => onChange({ showSubIssues: event.target.checked })}
          />
        </label>
      </PopoverContent>
    </Popover>
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
          className="inline-flex h-7 w-36 items-center justify-between gap-1 rounded-md bg-muted px-2 text-xs hover:bg-accent"
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
                  "flex h-8 w-full items-center rounded-md px-2 text-left text-sm hover:bg-muted",
                  selected === option.value && "bg-muted",
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
