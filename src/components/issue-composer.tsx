"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ISSUE_STATUSES,
  PRIORITIES,
  type IssueStatus,
  type Priority,
} from "@convex/model";
import LabelChip from "@/components/label-chip";
import PriorityIcon from "@/components/priority-icon";
import StatusIcon, { statusLabel } from "@/components/status-icon";
import UserAvatar from "@/components/user-avatar";
import { useWorkspace } from "@/components/workspace-provider";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cycleValue, dateInputToTimestamp, dateInputValue, errorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { addDays, format, startOfDay } from "date-fns";
import {
  Box,
  Calendar,
  CalendarClock,
  Link2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Paperclip,
  Repeat,
  Tag,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const draftSchema = z.object({
  title: z.string().trim().min(1, "Add a title").max(180),
  description: z.string().max(20000),
});

const LABEL_COLORS = ["#f2555a", "#f2994a", "#f2c94c", "#4cb782", "#5e6ad2", "#26b5ce"];

type Recurrence = "" | "daily" | "weekly" | "monthly";

type DraftLink = { url: string; title: string };

type Draft = {
  title: string;
  description: string;
  projectId: Id<"projects"> | "";
  status: IssueStatus;
  priority: Priority;
  assigneeId: Id<"users"> | null;
  labelIds: Id<"labels">[];
  dueDate: string;
  cycleId: Id<"cycles"> | null;
  recurrence: Recurrence;
  links: DraftLink[];
  subIssues: string[];
};

const emptyDraft = (projectId?: Id<"projects">, status: IssueStatus = "backlog"): Draft => ({
  title: "",
  description: "",
  projectId: projectId ?? "",
  status,
  priority: "none",
  assigneeId: null,
  labelIds: [],
  dueDate: "",
  cycleId: null,
  recurrence: "",
  links: [],
  subIssues: [],
});

function endOfWorkWeek(from: Date) {
  const day = from.getDay();
  if (day === 0) return addDays(from, 5);
  if (day === 6) return addDays(from, 6);
  return addDays(from, 5 - day);
}

function ymd(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function duePresets(now = new Date()) {
  const today = startOfDay(now);
  return {
    tomorrow: addDays(today, 1),
    endOfWeek: endOfWorkWeek(today),
    inOneWeek: addDays(today, 7),
  };
}

function composeDescription(draft: Draft) {
  let description = draft.description
    .trim()
    .replace(/\n*Recurs (daily|weekly|monthly)\.\s*$/g, "")
    .trim();
  const missingLinks = draft.links.filter((link) => !description.includes(link.url));
  if (missingLinks.length > 0) {
    description = [description, missingLinks.map((link) => `- [${link.title || link.url}](${link.url})`).join("\n")]
      .filter(Boolean)
      .join("\n\n");
  }
  if (draft.recurrence) {
    description = [description, `Recurs ${draft.recurrence}.`].filter(Boolean).join("\n\n");
  }
  return description;
}

const chipClass =
  "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 text-[13px] font-normal text-[#d0d1d4] hover:bg-white/10";

export default function IssueComposer() {
  const { workspace, composer, closeComposer, me } = useWorkspace();
  const open = composer !== null;
  const editingId = composer?.mode === "edit" ? composer.issueId : undefined;
  const issue = useQuery(api.issues.get, editingId ? { issueId: editingId } : "skip");
  const projects = useQuery(
    api.projects.list,
    workspace ? { workspaceId: workspace._id } : "skip",
  );
  const members = useQuery(
    api.users.listMembers,
    workspace ? { workspaceId: workspace._id } : "skip",
  );
  const labels = useQuery(api.labels.list, workspace ? { workspaceId: workspace._id } : "skip");
  const cycles = useQuery(api.cycles.list, workspace ? { workspaceId: workspace._id } : "skip");
  const createIssue = useMutation(api.issues.create);
  const setParent = useMutation(api.issues.setParent);
  const updateIssue = useMutation(api.issues.update);
  const createLabel = useMutation(api.labels.create);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [pending, setPending] = useState(false);
  const [labelName, setLabelName] = useState("");
  const [createMore, setCreateMore] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [subIssueDraft, setSubIssueDraft] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [showSubIssue, setShowSubIssue] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const hydratedIssue = useRef<string | null>(null);
  const assigneeDefaulted = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (composer?.mode !== "create") return;
    setDraft(emptyDraft(composer.projectId, composer.status ?? "backlog"));
    hydratedIssue.current = null;
    assigneeDefaulted.current = false;
    setSubIssueDraft("");
    setLinkUrl("");
    setShowSubIssue(false);
    setShowLink(false);
  }, [composer]);

  useEffect(() => {
    if (composer?.mode !== "create" || !me || assigneeDefaulted.current) return;
    assigneeDefaulted.current = true;
    setDraft((current) => (current.assigneeId ? current : { ...current, assigneeId: me._id }));
  }, [composer, me]);

  useEffect(() => {
    if (composer?.mode !== "create" || !projects?.length) return;
    setDraft((current) =>
      current.projectId ? current : { ...current, projectId: projects[0]?._id ?? "" },
    );
  }, [composer, projects]);

  useEffect(() => {
    if (!issue || composer?.mode !== "edit" || hydratedIssue.current === issue._id) return;
    hydratedIssue.current = issue._id;
    const recurrence = issue.description.match(/Recurs (daily|weekly|monthly)\./)?.[1] as
      | Recurrence
      | undefined;
    setDraft({
      title: issue.title,
      description: issue.description,
      projectId: issue.projectId,
      status: issue.status,
      priority: issue.priority,
      assigneeId: issue.assignee?._id ?? null,
      labelIds: issue.labels.map((label) => label._id),
      dueDate: dateInputValue(issue.dueDate),
      cycleId: issue.cycleId,
      recurrence: recurrence ?? "",
      links: [],
      subIssues: [],
    });
  }, [issue, composer]);

  function addSubIssue(title: string) {
    const next = title.trim();
    if (!next) return;
    setDraft((current) => ({ ...current, subIssues: [...current.subIssues, next] }));
    setSubIssueDraft("");
  }

  function addLink() {
    const url = linkUrl.trim();
    if (!url) return;
    let title = url;
    try {
      title = new URL(url).hostname;
    } catch {
      toast.error("Enter a full URL, including https://");
      return;
    }
    setDraft((current) => ({ ...current, links: [...current.links, { url, title }] }));
    setLinkUrl("");
  }

  async function submit() {
    if (!workspace || pending) return;
    const parsed = draftSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the issue");
      return;
    }
    if (!draft.projectId) {
      toast.error("Choose a project");
      return;
    }
    setPending(true);
    try {
      const dueDate = dateInputToTimestamp(draft.dueDate);
      const description = composeDescription({ ...draft, description: parsed.data.description });
      if (composer?.mode === "edit") {
        await updateIssue({
          issueId: composer.issueId,
          title: parsed.data.title,
          description,
          projectId: draft.projectId,
          status: draft.status,
          priority: draft.priority,
          assigneeId: draft.assigneeId,
          labelIds: draft.labelIds,
          dueDate,
          cycleId: draft.cycleId,
        });
        for (const subTitle of draft.subIssues) {
          await createIssue({
            projectId: draft.projectId,
            title: subTitle,
            status: draft.status,
            priority: draft.priority,
            assigneeId: draft.assigneeId,
            parentId: composer.issueId,
          });
        }
        closeComposer();
      } else {
        const relation = composer?.mode === "create" ? composer.relation : undefined;
        const createdId = await createIssue({
          projectId: draft.projectId,
          title: parsed.data.title,
          description,
          status: draft.status,
          priority: draft.priority,
          assigneeId: draft.assigneeId,
          labelIds: draft.labelIds,
          dueDate,
          cycleId: draft.cycleId,
          ...(relation?.kind === "child" ? { parentId: relation.issueId } : {}),
        });
        for (const subTitle of draft.subIssues) {
          await createIssue({
            projectId: draft.projectId,
            title: subTitle,
            status: draft.status,
            priority: draft.priority,
            assigneeId: draft.assigneeId,
            labelIds: draft.labelIds,
            dueDate,
            parentId: createdId,
          });
        }
        if (relation?.kind === "parent") {
          await setParent({ issueId: relation.issueId, parentId: createdId });
        }
        posthog.capture("issue_created", {
          status: draft.status,
          priority: draft.priority,
          has_assignee: Boolean(draft.assigneeId),
          create_more: createMore,
        });
        if (createMore) {
          setDraft((current) => ({ ...current, title: "", description: "" }));
          toast.success("Issue created");
          document.getElementById("issue-composer-title")?.focus();
        } else {
          closeComposer();
        }
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      const typing = event.target instanceof HTMLElement &&
        (event.target.tagName === "INPUT" ||
          event.target.tagName === "TEXTAREA" ||
          event.target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void submit();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.altKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        setShowLink(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        setShowSubIssue(true);
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        setDraft((current) => ({ ...current, status: cycleValue(ISSUE_STATUSES, current.status) }));
      } else if (key === "p") {
        event.preventDefault();
        setDraft((current) => ({
          ...current,
          priority: cycleValue(PRIORITIES, current.priority),
        }));
      } else if (key === "a") {
        event.preventDefault();
        const options: Array<Id<"users"> | null> = [null, ...(members?.map((member) => member._id) ?? [])];
        setDraft((current) => ({
          ...current,
          assigneeId: cycleValue(options, current.assigneeId),
        }));
      } else if (event.shiftKey && key === "d") {
        event.preventDefault();
        setDraft((current) => ({ ...current, dueDate: ymd(duePresets().tomorrow) }));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function addLabel() {
    if (!workspace) return;
    const name = labelName.trim();
    if (!name) return;
    try {
      const labelId = await createLabel({
        workspaceId: workspace._id,
        name,
        color: LABEL_COLORS[draft.labelIds.length % LABEL_COLORS.length] ?? "#5e6ad2",
      });
      setDraft((current) => ({ ...current, labelIds: [...current.labelIds, labelId] }));
      setLabelName("");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const assignee = members?.find((member) => member._id === draft.assigneeId) ?? null;
  const selectedLabels = labels?.filter((label) => draft.labelIds.includes(label._id)) ?? [];
  const assignableCycles =
    cycles?.filter(
      (cycle) =>
        cycle.status === "upcoming" ||
        cycle.status === "active" ||
        cycle._id === draft.cycleId,
    ) ?? [];
  const selectedCycle = assignableCycles.find((cycle) => cycle._id === draft.cycleId) ?? null;
  const selectedProject = projects?.find((project) => project._id === draft.projectId) ?? null;
  const presets = duePresets();
  const dueLabel = draft.dueDate
    ? format(dateInputToTimestamp(draft.dueDate) ?? Date.now(), "MMM d")
    : null;
  const heading =
    composer?.mode === "edit"
      ? "Edit issue"
      : composer?.relation?.kind === "child"
        ? "New sub-issue"
        : composer?.relation?.kind === "parent"
          ? "New parent issue"
          : "New issue";

  function setDue(date: Date | null) {
    setDraft((current) => ({ ...current, dueDate: date ? ymd(date) : "" }));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) closeComposer(); }}>
      <DialogContent
        className={cn(
          "gap-0 overflow-hidden border border-white/10 bg-[#191a1f] p-0 text-[#e6e6e6] shadow-2xl sm:max-w-[680px]",
          expanded && "sm:max-w-4xl",
        )}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{heading}</DialogTitle>
        <DialogDescription className="sr-only">
          {me?.name ? `Creating as ${me.name}. ` : ""}
          Shortcuts: S status, P priority, A assignee, Shift D tomorrow, ⌘Enter save.
        </DialogDescription>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-[13px] text-[#8b8f98]">
            <span className="flex size-4 items-center justify-center rounded-[4px] bg-[#5e6ad2] text-[9px] font-semibold text-white">
              {(workspace?.name ?? "W").slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate text-[#c6c7cb]">{workspace?.name ?? "Workspace"}</span>
            <span aria-hidden>›</span>
            <span className="truncate">{heading}</span>
            <div className="ml-auto flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-[#8b8f98] hover:bg-white/5 hover:text-white"
                onClick={() => setExpanded((current) => !current)}
                aria-label={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? <Minimize2 /> : <Maximize2 />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-[#8b8f98] hover:bg-white/5 hover:text-white"
                onClick={() => closeComposer()}
                aria-label="Close"
              >
                <X />
              </Button>
            </div>
          </div>
          <div className={cn("px-4 pt-3", expanded && "min-h-[46vh]")}>
            <Input
              id="issue-composer-title"
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="Issue title"
              className="h-9 border-none bg-transparent px-0 text-lg font-medium text-[#f3f3f3] shadow-none placeholder:text-[#6d717a] focus-visible:ring-0"
              autoFocus
            />
            <Textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Add description..."
              className="min-h-24 resize-none border-none bg-transparent px-0 text-sm text-[#d0d1d4] shadow-none placeholder:text-[#6d717a] focus-visible:ring-0"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
            <DropdownMenu>
              <DropdownMenuTrigger render={<button type="button" className={chipClass} />}>
                <StatusIcon status={draft.status} />
                {statusLabel(draft.status)}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {ISSUE_STATUSES.map((status) => (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => setDraft((current) => ({ ...current, status }))}
                  >
                    <StatusIcon status={status} />
                    {statusLabel(status)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger render={<button type="button" className={chipClass} />}>
                <PriorityIcon priority={draft.priority} />
                {draft.priority === "none" ? "Priority" : draft.priority[0]?.toUpperCase() + draft.priority.slice(1)}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {PRIORITIES.map((priority) => (
                  <DropdownMenuItem
                    key={priority}
                    onClick={() => setDraft((current) => ({ ...current, priority }))}
                  >
                    <PriorityIcon priority={priority} />
                    {priority === "none" ? "No priority" : priority[0]?.toUpperCase() + priority.slice(1)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger render={<button type="button" className={chipClass} />}>
                <UserAvatar user={assignee} className="size-4" />
                <span className="truncate">{assignee?.name || assignee?.email || "Assignee"}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  onClick={() => setDraft((current) => ({ ...current, assigneeId: null }))}
                >
                  Unassigned
                </DropdownMenuItem>
                {members?.map((member) => (
                  <DropdownMenuItem
                    key={member._id}
                    onClick={() => setDraft((current) => ({ ...current, assigneeId: member._id }))}
                  >
                    <UserAvatar user={member} />
                    {member.name || member.email}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger render={<button type="button" className={chipClass} />}>
                <Box className="size-3.5 text-[#8b8f98]" />
                {selectedProject?.name ?? "Project"}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {projects?.map((project) => (
                  <DropdownMenuItem
                    key={project._id}
                    onClick={() =>
                      setDraft((current) => ({ ...current, projectId: project._id }))
                    }
                  >
                    {project.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Popover>
              <PopoverTrigger render={<button type="button" className={chipClass} />}>
                <Tag className="size-3.5 text-[#8b8f98]" />
                {selectedLabels.length > 0
                  ? selectedLabels.map((label) => (
                      <LabelChip key={label._id} name={label.name} color={label.color} />
                    ))
                  : "Labels"}
              </PopoverTrigger>
              <PopoverContent className="w-64" align="start">
                <div className="flex max-h-48 flex-col gap-1 overflow-auto">
                  {labels?.map((label) => {
                    const selected = draft.labelIds.includes(label._id);
                    return (
                      <button
                        key={label._id}
                        type="button"
                        className="flex items-center justify-between rounded-md px-1 py-1 text-left hover:bg-accent"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            labelIds: selected
                              ? current.labelIds.filter((id) => id !== label._id)
                              : [...current.labelIds, label._id],
                          }))
                        }
                      >
                        <LabelChip name={label.name} color={label.color} />
                        {selected ? <span className="text-xs text-muted-foreground">On</span> : null}
                      </button>
                    );
                  })}
                </div>
                <form
                  className="mt-2 flex gap-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void addLabel();
                  }}
                >
                  <Input
                    value={labelName}
                    onChange={(event) => setLabelName(event.target.value)}
                    placeholder="New label"
                  />
                  <Button type="submit" size="sm" variant="secondary">
                    Add
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
            {dueLabel ? (
              <button type="button" className={chipClass} onClick={() => setDue(null)}>
                <Calendar className="size-3.5 text-[#8b8f98]" />
                {dueLabel}
              </button>
            ) : null}
            {draft.recurrence ? (
              <button
                type="button"
                className={chipClass}
                onClick={() => setDraft((current) => ({ ...current, recurrence: "" }))}
              >
                <Repeat className="size-3.5 text-[#8b8f98]" />
                {draft.recurrence[0]?.toUpperCase()}
                {draft.recurrence.slice(1)}
              </button>
            ) : null}
            {selectedCycle ? (
              <span className={chipClass}>Cycle {selectedCycle.number}</span>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<button type="button" className={cn(chipClass, "px-2")} aria-label="More options" />}
              >
                <MoreHorizontal className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-56">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <CalendarClock />
                    Set due date
                    <DropdownMenuShortcut>⇧D</DropdownMenuShortcut>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-56">
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Try: 24h, 7 days, Feb 9</div>
                    <label className="flex items-center gap-2 px-2 py-1.5 text-sm">
                      <Calendar className="size-3.5 text-muted-foreground" />
                      Custom...
                      <input
                        type="date"
                        value={draft.dueDate}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, dueDate: event.target.value }))
                        }
                        className="ml-auto bg-transparent text-xs"
                        aria-label="Custom due date"
                      />
                    </label>
                    <DropdownMenuItem onClick={() => setDue(presets.tomorrow)}>
                      <Calendar />
                      Tomorrow
                      <DropdownMenuShortcut>{format(presets.tomorrow, "EEE, d MMM")}</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDue(presets.endOfWeek)}>
                      <Calendar />
                      End of this week
                      <DropdownMenuShortcut>{format(presets.endOfWeek, "EEE, d MMM")}</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDue(presets.inOneWeek)}>
                      <Calendar />
                      In one week
                      <DropdownMenuShortcut>{format(presets.inOneWeek, "EEE, d MMM")}</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    {draft.dueDate ? (
                      <DropdownMenuItem onClick={() => setDue(null)}>Clear due date</DropdownMenuItem>
                    ) : null}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Repeat />
                    Make recurring...
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {(["", "daily", "weekly", "monthly"] as const).map((value) => (
                      <DropdownMenuItem
                        key={value || "none"}
                        onClick={() => setDraft((current) => ({ ...current, recurrence: value }))}
                      >
                        {value === "" ? "Does not repeat" : value[0]?.toUpperCase() + value.slice(1)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={() => setShowLink(true)}>
                  <Link2 />
                  Add link...
                  <DropdownMenuShortcut>Ctrl Alt L</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowSubIssue(true)}>
                  <Box />
                  Add sub-issue
                  <DropdownMenuShortcut>Ctrl ⇧ O</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Cycle</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      onClick={() => setDraft((current) => ({ ...current, cycleId: null }))}
                    >
                      No cycle
                    </DropdownMenuItem>
                    {assignableCycles.map((cycle) => (
                      <DropdownMenuItem
                        key={cycle._id}
                        onClick={() => setDraft((current) => ({ ...current, cycleId: cycle._id }))}
                      >
                        Cycle {cycle.number}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {showLink || draft.links.length > 0 ? (
            <div className="space-y-1 px-4 pb-3">
              {draft.links.map((link) => (
                <div key={link.url} className="flex items-center gap-2 text-xs text-[#c6c7cb]">
                  <Link2 className="size-3.5" />
                  <span className="truncate">{link.title}</span>
                  <button
                    type="button"
                    className="ml-auto text-[#8b8f98]"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        links: current.links.filter((item) => item.url !== link.url),
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              {showLink ? (
                <div className="flex gap-1">
                  <Input
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.target.value)}
                    placeholder="https://"
                    className="h-8"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addLink();
                      }
                    }}
                  />
                  <Button type="button" size="sm" variant="secondary" onClick={addLink}>
                    Add
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
          {showSubIssue || draft.subIssues.length > 0 ? (
            <div className="space-y-1 px-4 pb-3">
              {draft.subIssues.map((title, index) => (
                <div key={`${title}-${index}`} className="flex items-center gap-2 text-xs text-[#c6c7cb]">
                  <StatusIcon status={draft.status} />
                  <span className="truncate">{title}</span>
                  <button
                    type="button"
                    className="ml-auto text-[#8b8f98]"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        subIssues: current.subIssues.filter((_, item) => item !== index),
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              {showSubIssue ? (
                <Input
                  value={subIssueDraft}
                  onChange={(event) => setSubIssueDraft(event.target.value)}
                  placeholder="Sub-issue title"
                  className="h-8"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addSubIssue(subIssueDraft);
                    }
                  }}
                />
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-white/8 px-3 py-2.5">
            <div>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  setDraft((current) => ({
                    ...current,
                    description: current.description
                      ? `${current.description}\nAttached: ${file.name}`
                      : `Attached: ${file.name}`,
                  }));
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-[#8b8f98] hover:bg-white/5 hover:text-white"
                aria-label="Attach file"
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip />
              </Button>
            </div>
            <div className="flex items-center gap-3">
              {composer?.mode !== "edit" ? (
                <label className="flex items-center gap-2 text-[13px] text-[#c6c7cb]">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={createMore}
                    aria-label="Create more"
                    onClick={() => setCreateMore((current) => !current)}
                    className={cn(
                      "relative h-[18px] w-8 rounded-full transition-colors",
                      createMore ? "bg-[#5e6ad2]" : "bg-white/15",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-3.5 rounded-full bg-white transition-transform",
                        createMore ? "left-4" : "left-0.5",
                      )}
                    />
                  </button>
                  Create more
                </label>
              ) : null}
              <Button
                type="submit"
                disabled={pending}
                className="h-8 rounded-md bg-[#5e6ad2] px-3 text-white hover:bg-[#6d78e0]"
              >
                {composer?.mode === "edit" ? "Save" : "Create issue"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
