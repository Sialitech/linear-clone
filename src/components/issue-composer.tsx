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
import PriorityIcon, { priorityLabel } from "@/components/priority-icon";
import StatusIcon, { statusLabel } from "@/components/status-icon";
import UserAvatar from "@/components/user-avatar";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cycleValue, dateInputToTimestamp, dateInputValue, errorMessage } from "@/lib/format";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const draftSchema = z.object({
  title: z.string().trim().min(1, "Add a title").max(180),
  description: z.string().max(20000),
});

const LABEL_COLORS = ["#f2555a", "#f2994a", "#f2c94c", "#4cb782", "#5e6ad2", "#26b5ce"];

type Draft = {
  title: string;
  description: string;
  projectId: Id<"projects"> | "";
  status: IssueStatus;
  priority: Priority;
  assigneeId: Id<"users"> | null;
  labelIds: Id<"labels">[];
  dueDate: string;
};

const emptyDraft = (projectId?: Id<"projects">): Draft => ({
  title: "",
  description: "",
  projectId: projectId ?? "",
  status: "todo",
  priority: "none",
  assigneeId: null,
  labelIds: [],
  dueDate: "",
});

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
  const createIssue = useMutation(api.issues.create);
  const updateIssue = useMutation(api.issues.update);
  const createLabel = useMutation(api.labels.create);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [pending, setPending] = useState(false);
  const [labelName, setLabelName] = useState("");
  const hydratedIssue = useRef<string | null>(null);

  useEffect(() => {
    if (composer?.mode !== "create") return;
    setDraft(emptyDraft(composer.projectId));
    hydratedIssue.current = null;
  }, [composer]);

  useEffect(() => {
    if (composer?.mode !== "create" || !projects?.length) return;
    setDraft((current) =>
      current.projectId ? current : { ...current, projectId: projects[0]?._id ?? "" },
    );
  }, [composer, projects]);

  useEffect(() => {
    if (!issue || composer?.mode !== "edit" || hydratedIssue.current === issue._id) return;
    hydratedIssue.current = issue._id;
    setDraft({
      title: issue.title,
      description: issue.description,
      projectId: issue.projectId,
      status: issue.status,
      priority: issue.priority,
      assigneeId: issue.assignee?._id ?? null,
      labelIds: issue.labels.map((label) => label._id),
      dueDate: dateInputValue(issue.dueDate),
    });
  }, [issue, composer]);

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
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
      if (composer?.mode === "edit") {
        await updateIssue({
          issueId: composer.issueId,
          title: parsed.data.title,
          description: parsed.data.description,
          projectId: draft.projectId,
          status: draft.status,
          priority: draft.priority,
          assigneeId: draft.assigneeId,
          labelIds: draft.labelIds,
          dueDate,
        });
      } else {
        await createIssue({
          projectId: draft.projectId,
          title: parsed.data.title,
          description: parsed.data.description,
          status: draft.status,
          priority: draft.priority,
          assigneeId: draft.assigneeId,
          labelIds: draft.labelIds,
          dueDate,
        });
      }
      closeComposer();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

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

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) closeComposer(); }}>
      <DialogContent className="sm:max-w-2xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>{composer?.mode === "edit" ? "Edit issue" : "New issue"}</DialogTitle>
          <DialogDescription>
            {me?.name ? `Creating as ${me.name}. ` : ""}
            Shortcuts: S status, P priority, A assignee, ⌘Enter save.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="space-y-3"
        >
          <Input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="Issue title"
            className="h-10 border-none bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
            autoFocus
          />
          <Textarea
            value={draft.description}
            onChange={(event) =>
              setDraft((current) => ({ ...current, description: event.target.value }))
            }
            placeholder="Add a description…"
            className="min-h-28 resize-none border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
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
              <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
                <PriorityIcon priority={draft.priority} />
                {priorityLabel(draft.priority)}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {PRIORITIES.map((priority) => (
                  <DropdownMenuItem
                    key={priority}
                    onClick={() => setDraft((current) => ({ ...current, priority }))}
                  >
                    <PriorityIcon priority={priority} />
                    {priorityLabel(priority)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
                <UserAvatar user={assignee} />
                {assignee?.name || assignee?.email || "Assignee"}
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
            <Popover>
              <PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}>
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
                        className="flex items-center justify-between rounded-md px-1 py-1 text-left hover:bg-white/5"
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
            <Input
              type="date"
              value={draft.dueDate}
              onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
              className="h-7 w-36 text-xs"
            />
            <select
              value={draft.projectId}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  projectId: event.target.value as Id<"projects">,
                }))
              }
              className="h-7 rounded-md border border-border bg-transparent px-2 text-xs"
            >
              {projects?.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-[11px] text-muted-foreground">S · P · A · ⌘Enter</span>
            <Button type="submit" disabled={pending}>
              {composer?.mode === "edit" ? "Save" : "Create issue"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
