"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ISSUE_STATUSES, PRIORITIES, type IssueStatus } from "@convex/model";
import IssueActivity from "@/components/issue-activity";
import IssueContextMenu from "@/components/issue-context-menu";
import MarkdownBody from "@/components/markdown-body";
import MarkdownEditor, { type EditorCaret } from "@/components/markdown-editor";
import { useUploadImage } from "@/components/use-upload-image";
import LabelChip from "@/components/label-chip";
import PriorityIcon, { priorityLabel } from "@/components/priority-icon";
import StatusIcon, { statusLabel } from "@/components/status-icon";
import SubIssueProgress from "@/components/sub-issue-progress";
import UserAvatar from "@/components/user-avatar";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { dateInputToTimestamp, dateInputValue, errorMessage, formatDue, isOverdue } from "@/lib/format";
import { issueBranchName } from "@/lib/github-branch";
import { toggleTaskAt, type MentionMark } from "@/lib/markdown-edit";
import {
  activeMentionIds,
  filterMembers,
  findMentionQuery,
  memberMentionLabel,
  mentionToken,
  type MentionMember,
} from "@/lib/mentions";
import type { IssueItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAction, useMutation, useQuery } from "convex/react";
import { Copy, ExternalLink, Unlink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import SubIssueStatusDialog from "@/components/sub-issue-status-dialog";
import { toast } from "sonner";
import { z } from "zod";


const commentSchema = z.string().trim().min(1, "Write a comment").max(10000);
const prUrlSchema = z
  .string()
  .trim()
  .url("Paste a GitHub pull request URL")
  .refine(
    (value) => /^https:\/\/(www\.)?github\.com\/[^/]+\/[^/]+\/pull\/\d+\/?$/.test(value),
    "Paste a GitHub pull request URL",
  );

type PendingMention = { userId: Id<"users">; token: string };

function mentionMarks(mentionIds: Id<"users">[], members: MentionMember[]): MentionMark[] {
  const byId = new Map(members.map((member) => [member._id, member]));
  return mentionIds.flatMap((id) => {
    const member = byId.get(id);
    if (!member) return [];
    return [{ userId: id, token: mentionToken(member) }];
  });
}

function pendingMarks(pending: PendingMention[]): MentionMark[] {
  return pending.map((item) => ({ userId: item.userId, token: item.token }));
}

export default function IssueDetail({ issueId, onClose }: { issueId: string; onClose?: () => void }) {
  const id = issueId as Id<"issues">;
  const router = useRouter();
  const { workspace, me, openIssue, peekIssueId, closeIssue } = useWorkspace();
  const issue = useQuery(api.issues.get, { issueId: id });
  const comments = useQuery(api.comments.list, issue ? { issueId: id } : "skip");
  const members = useQuery(
    api.users.listMembers,
    workspace ? { workspaceId: workspace._id } : "skip",
  );
  const pullRequests = useQuery(api.github.listPullRequests, issue ? { issueId: id } : "skip");
  const cycles = useQuery(
    api.cycles.list,
    workspace ? { workspaceId: workspace._id } : "skip",
  );
  const update = useMutation(api.issues.update);
  const remove = useMutation(api.issues.remove);
  const createComment = useMutation(api.comments.create);
  const updateComment = useMutation(api.comments.update);
  const removeComment = useMutation(api.comments.remove);
  const linkPullRequest = useMutation(api.github.linkPullRequest);
  const unlinkPullRequest = useMutation(api.github.unlinkPullRequest);
  const refreshPullRequest = useAction(api.github.refreshPullRequest);
  const [comment, setComment] = useState("");
  const [pendingMentions, setPendingMentions] = useState<PendingMention[]>([]);
  const [editingComment, setEditingComment] = useState<Id<"comments"> | null>(null);
  const [editingText, setEditingText] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [pendingStatus, setPendingStatus] = useState<IssueStatus | null>(null);
  const branchName = issue ? issueBranchName(issue.identifier, issue.title) : "";
  const [editingMentions, setEditingMentions] = useState<PendingMention[]>([]);

  async function patch(args: Parameters<typeof update>[0]) {
    try {
      await update(args);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function chooseStatus(status: IssueStatus) {
    if (!issue || status === issue.status) return;
    if (issue.subIssues.total > 0) {
      setPendingStatus(status);
      return;
    }
    void patch({ issueId: id, status });
  }

  function applyPendingStatus(applyToSubIssues: boolean) {
    const status = pendingStatus;
    setPendingStatus(null);
    if (!status) return;
    void patch({ issueId: id, status, ...(applyToSubIssues ? { applyToSubIssues: true } : {}) });
  }

  async function onComment(event: React.FormEvent) {
    event.preventDefault();
    const parsed = commentSchema.safeParse(comment);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Write a comment");
      return;
    }
    try {
      await createComment({
        issueId: id,
        content: parsed.data,
        mentionIds: activeMentionIds(parsed.data, pendingMentions),
      });
      setComment("");
      setPendingMentions([]);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onDelete() {
    if (!window.confirm("Delete this issue?")) return;
    try {
      await remove({ issueId: id });
      if (onClose) onClose();
      else if (peekIssueId === id) closeIssue();
      else router.push(issue ? `/projects/${issue.projectId}` : "/");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function copyBranch() {
    try {
      await navigator.clipboard.writeText(branchName);
      toast.success("Branch name copied");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onLinkPr(event: React.FormEvent) {
    event.preventDefault();
    const parsed = prUrlSchema.safeParse(prUrl);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Paste a GitHub pull request URL");
      return;
    }
    try {
      const pullRequestId = await linkPullRequest({ issueId: id, url: parsed.data });
      setPrUrl("");
      toast.success("Pull request linked");
      void refreshPullRequest({ pullRequestId }).catch(() => {
        // Optional enrichment when a GitHub token is present.
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (issue === undefined) {
    return (
      <div className="flex h-full min-h-0 flex-col" aria-busy="true" aria-label="Loading issue">
        <header className="flex min-h-12 items-center border-b border-border px-3 sm:px-4">
          <span className="h-3.5 w-24 animate-pulse rounded-md bg-muted" />
        </header>
        <div className="mx-auto w-full max-w-3xl space-y-3 p-6">
          <div className="h-6 w-2/3 animate-pulse rounded-md bg-muted" />
          <div className="h-3 w-full animate-pulse rounded-md bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded-md bg-muted" />
          <div className="h-3 w-3/5 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    );
  }
  if (issue === null) {
    return <div className="p-6 text-sm text-muted-foreground">Issue not found.</div>;
  }

  const memberList = members ?? [];

  return (
    <>
    <IssueContextMenu issue={issue} className="flex h-full min-h-0 flex-col">
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-12 items-center gap-2 border-b border-border px-3 py-2 sm:gap-3 sm:px-4">
        {issue.parent ? (
          <Link
            href={`/issues/${issue.parent._id}`}
            className="shrink-0 font-mono text-xs text-muted-foreground hover:text-foreground"
            onClick={(event) => openLinkedIssue(event, issue.parent!._id, openIssue)}
          >
            {issue.parent.identifier}
          </Link>
        ) : null}
        {issue.parent ? <span className="text-xs text-muted-foreground">/</span> : null}
        <Link href={`/projects/${issue.projectId}`} className="shrink-0 font-mono text-xs text-muted-foreground hover:text-foreground">
          {issue.identifier}
        </Link>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{issue.projectName}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1 pr-8">
          <Button type="button" variant="ghost" size="sm" className="h-9 sm:h-7" onClick={() => void onDelete()}>
            Delete
          </Button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden pb-[env(safe-area-inset-bottom)] lg:grid-cols-[minmax(0,1fr)_280px] lg:grid-rows-[minmax(0,1fr)] lg:pb-0">
        <div className="flex min-h-0 flex-col overflow-hidden">
          <div className="max-h-[min(24rem,58%)] min-h-0 shrink-0 overflow-y-auto overscroll-y-contain px-4 py-3 sm:px-6 sm:py-4">
            <InlineTitle issueId={id} title={issue.title} />
            <InlineDescription key={id} issueId={id} description={issue.description ?? ""} />
            <SubIssues issueId={id} projectId={issue.projectId} />
          </div>
          <IssueActivity issueId={id} />
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border px-4 py-2 sm:px-6 lg:py-3">
            <div className="mb-3 flex shrink-0 items-center gap-2">
              <h2 className="text-sm font-medium">Comments</h2>
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                Live
              </span>
            </div>
            <div
              className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain pr-1 [scrollbar-width:thin]"
              tabIndex={0}
              aria-label="Comments"
            >
              {comments?.map((item) => (
                <article key={item._id} className="flex gap-2">
                  <UserAvatar user={item.author} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-foreground">{item.author?.name || item.author?.email}</span>
                      <span>{formatDue(item.createdAt)}</span>
                      {item.author?._id === me?._id ? (
                        <button
                          type="button"
                          className="hover:text-foreground"
                          onClick={() => {
                            setEditingComment(item._id);
                            setEditingText(item.content);
                            setEditingMentions(
                              item.mentionIds
                                .map((mentionId) => {
                                  const member = memberList.find((entry) => entry._id === mentionId);
                                  if (!member) return null;
                                  return { userId: mentionId, token: mentionToken(member) };
                                })
                                .filter((entry): entry is PendingMention => entry !== null),
                            );
                          }}
                        >
                          Edit
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="hover:text-foreground"
                        onClick={() => void removeComment({ commentId: item._id }).catch((error: unknown) => toast.error(errorMessage(error)))}
                      >
                        Delete
                      </button>
                    </div>
                    {editingComment === item._id ? (
                      <form
                        className="mt-2 space-y-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const parsed = commentSchema.safeParse(editingText);
                          if (!parsed.success) return;
                          void updateComment({
                            commentId: item._id,
                            content: parsed.data,
                            mentionIds: activeMentionIds(parsed.data, editingMentions),
                          })
                            .then(() => {
                              setEditingComment(null);
                              setEditingMentions([]);
                            })
                            .catch((error: unknown) => toast.error(errorMessage(error)));
                        }}
                      >
                        <MentionComposer
                          value={editingText}
                          members={memberList}
                          pending={editingMentions}
                          onChange={setEditingText}
                          onPendingChange={setEditingMentions}
                          ariaLabel="Edit comment"
                        />
                        <Button type="submit" size="sm">Save</Button>
                      </form>
                    ) : (
                      <div className="mt-1">
                        <MarkdownBody
                          source={item.content}
                          mentions={mentionMarks(item.mentionIds, memberList)}
                          onToggleTask={
                            item.author?._id === me?._id
                              ? (index) => {
                                  const next = toggleTaskAt(item.content, index);
                                  if (next === item.content) return;
                                  void updateComment({
                                    commentId: item._id,
                                    content: next,
                                    mentionIds: item.mentionIds,
                                  }).catch((error: unknown) => toast.error(errorMessage(error)));
                                }
                              : undefined
                          }
                        />
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <form onSubmit={onComment} className="mt-3 flex shrink-0 items-end gap-2">
              <div className="min-w-0 flex-1">
                <MentionComposer
                  value={comment}
                  members={memberList}
                  pending={pendingMentions}
                  onChange={setComment}
                  onPendingChange={setPendingMentions}
                  placeholder="Leave a comment…"
                  menuPlacement="up"
                  ariaLabel="Comment"
                />
              </div>
              <Button type="submit" size="sm" className="mb-0.5 shrink-0">Comment</Button>
            </form>
          </section>
        </div>
        <aside className="order-first max-h-[16dvh] min-h-0 overflow-y-auto overscroll-y-contain border-b border-border px-3 py-2 lg:order-last lg:max-h-none lg:border-b-0 lg:border-l lg:px-4 lg:py-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-1 lg:gap-4 [&_button]:h-9 [&_button]:max-w-full [&_button]:shrink sm:[&_button]:h-7">
          <Field label="Status">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>
                <StatusIcon status={issue.status} />
                {statusLabel(issue.status)}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {ISSUE_STATUSES.map((status) => (
                  <DropdownMenuItem key={status} onClick={() => chooseStatus(status)}>
                    <StatusIcon status={status} />
                    {statusLabel(status)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </Field>
          <ParentField issue={issue} workspaceId={workspace?._id} />
          <Field label="Priority">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>
                <PriorityIcon priority={issue.priority} />
                {priorityLabel(issue.priority)}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {PRIORITIES.map((priority) => (
                  <DropdownMenuItem key={priority} onClick={() => void patch({ issueId: id, priority })}>
                    <PriorityIcon priority={priority} />
                    {priorityLabel(priority)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </Field>
          <Field label="Assignee">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>
                <UserAvatar user={issue.assignee} />
                {issue.assignee?.name || issue.assignee?.email || "Unassigned"}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => void patch({ issueId: id, assigneeId: null })}>
                  Unassigned
                </DropdownMenuItem>
                {members?.map((member) => (
                  <DropdownMenuItem
                    key={member._id}
                    onClick={() => void patch({ issueId: id, assigneeId: member._id })}
                  >
                    <UserAvatar user={member} />
                    {member.name || member.email}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </Field>
          <Field label="Labels">
            <div className="flex flex-wrap gap-1">
              {issue.labels.length === 0 ? (
                <span className="text-xs text-muted-foreground">None</span>
              ) : (
                issue.labels.map((label) => (
                  <LabelChip key={label._id} name={label.name} color={label.color} />
                ))
              )}
            </div>
          </Field>
          <Field label="Due">
            <input
              type="date"
              value={dateInputValue(issue.dueDate)}
              onChange={(event) =>
                void patch({ issueId: id, dueDate: dateInputToTimestamp(event.target.value) })
              }
              className={cn(
                "h-9 w-full rounded-md border border-border bg-transparent px-2 text-base sm:h-7 sm:text-xs",
                issue.dueDate && isOverdue(issue.dueDate, issue.status) && "text-destructive",
              )}
            />
          </Field>
          <Field label="Cycle">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>
                {issue.cycle ? `Cycle ${issue.cycle.number}` : "No cycle"}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => void patch({ issueId: id, cycleId: null })}>
                  No cycle
                </DropdownMenuItem>
                {cycles
                  ?.filter(
                    (cycle) =>
                      cycle.status === "upcoming" ||
                      cycle.status === "active" ||
                      cycle._id === issue.cycleId,
                  )
                  .map((cycle) => (
                    <DropdownMenuItem
                      key={cycle._id}
                      onClick={() => void patch({ issueId: id, cycleId: cycle._id })}
                    >
                      Cycle {cycle.number}
                      {cycle.status === "completed" ? " (completed)" : ""}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </Field>
          <Field label="Git branch">
            <div className="flex min-w-0 items-center gap-1">
              <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                {branchName}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 shrink-0 px-2 sm:h-7"
                onClick={() => void copyBranch()}
                aria-label="Copy branch name"
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          </Field>
          <Field label="Pull requests">
            <div className="space-y-2">
              {pullRequests?.map((pr) => (
                <div key={pr._id} className="flex min-w-0 items-center gap-1 text-xs">
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-w-0 flex-1 items-center gap-1 truncate text-foreground hover:underline"
                  >
                    <span className="truncate font-mono">{pr.label}</span>
                    {pr.state ? (
                      <span className="shrink-0 text-[10px] text-muted-foreground capitalize">
                        {pr.state}
                      </span>
                    ) : null}
                    <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 shrink-0 px-2 sm:h-7"
                    aria-label={`Unlink ${pr.label}`}
                    onClick={() =>
                      void unlinkPullRequest({ pullRequestId: pr._id })
                        .then(() => toast.success("Pull request unlinked"))
                        .catch((error: unknown) => toast.error(errorMessage(error)))
                    }
                  >
                    <Unlink className="size-3.5" />
                  </Button>
                </div>
              ))}
              <form onSubmit={onLinkPr} className="flex flex-col gap-1.5">
                <Input
                  value={prUrl}
                  onChange={(event) => setPrUrl(event.target.value)}
                  placeholder="https://github.com/org/repo/pull/1"
                  className="h-9 text-xs sm:h-7"
                />
                <Button type="submit" size="sm" variant="outline" className="h-9 sm:h-7">
                  Link PR
                </Button>
              </form>
            </div>
          </Field>
          </div>
        </aside>
      </div>
    </div>
    </IssueContextMenu>
    <SubIssueStatusDialog
      open={pendingStatus !== null}
      status={pendingStatus}
      count={issue.subIssues.total}
      onDismiss={() => setPendingStatus(null)}
      onOnlyThis={() => applyPendingStatus(false)}
      onAll={() => applyPendingStatus(true)}
    />
    </>
  );
}

function SubIssues({
  issueId,
  projectId,
}: {
  issueId: Id<"issues">;
  projectId: Id<"projects">;
}) {
  const { openIssue } = useWorkspace();
  const children = useQuery(api.issues.children, { issueId });
  const create = useMutation(api.issues.create);
  const update = useMutation(api.issues.update);
  const [title, setTitle] = useState("");
  const total = children?.length ?? 0;
  const done = children?.filter((child) => child.status === "done").length ?? 0;

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    const next = title.trim();
    if (!next) return;
    try {
      await create({ projectId, title: next, parentId: issueId, status: "todo" });
      setTitle("");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-medium">Sub-issues</h2>
        <SubIssueProgress done={done} total={total} />
      </div>
      <ul className="divide-y divide-border rounded-md border border-border">
        {children === undefined ? (
          <li className="flex items-center gap-2 px-3 py-2" aria-busy="true" aria-label="Loading sub-issues">
            <span className="size-3.5 animate-pulse rounded-full bg-muted" />
            <span className="h-3 w-40 animate-pulse rounded-md bg-muted" />
          </li>
        ) : null}
        {children?.map((child) => (
          <li key={child._id} className="flex items-center gap-2 px-2 py-1.5">
            <button
              type="button"
              className="shrink-0"
              aria-label={`Set ${child.identifier} to ${child.status === "done" ? "to do" : "done"}`}
              onClick={() =>
                void update({
                  issueId: child._id,
                  status: child.status === "done" ? "todo" : "done",
                }).catch((error: unknown) => toast.error(errorMessage(error)))
              }
            >
              <StatusIcon status={child.status} />
            </button>
            <Link
              href={`/issues/${child._id}`}
              className="shrink-0 font-mono text-xs text-muted-foreground"
              onClick={(event) => openLinkedIssue(event, child._id, openIssue)}
            >
              {child.identifier}
            </Link>
            <Link
              href={`/issues/${child._id}`}
              className="min-w-0 flex-1 truncate text-sm"
              onClick={(event) => openLinkedIssue(event, child._id, openIssue)}
            >
              {child.title}
            </Link>
          </li>
        ))}
        <li>
          <form onSubmit={(event) => void onCreate(event)}>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Add sub-issue"
              className="h-9 border-none text-sm shadow-none focus-visible:ring-0 sm:h-8"
            />
          </form>
        </li>
      </ul>
    </section>
  );
}

function ParentField({
  issue,
  workspaceId,
}: {
  issue: IssueItem;
  workspaceId: Id<"workspaces"> | undefined;
}) {
  const { openIssue } = useWorkspace();
  const setParent = useMutation(api.issues.setParent);
  const [query, setQuery] = useState("");
  const search = query.trim();
  const results = useQuery(
    api.issues.list,
    workspaceId && search.length >= 2
      ? { workspaceId, search }
      : "skip",
  );
  const options = (results ?? []).filter((candidate) => candidate._id !== issue._id).slice(0, 8);

  async function choose(parentId: Id<"issues"> | null) {
    try {
      await setParent({ issueId: issue._id, parentId });
      setQuery("");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Field label="Parent">
      <div className="space-y-1.5">
        {issue.parent ? (
          <div className="flex items-center gap-1 text-xs">
            <Link
              href={`/issues/${issue.parent._id}`}
              className="min-w-0 flex-1 truncate hover:underline"
              onClick={(event) => openLinkedIssue(event, issue.parent!._id, openIssue)}
            >
              <span className="font-mono text-muted-foreground">{issue.parent.identifier}</span>{" "}
              {issue.parent.title}
            </Link>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => void choose(null)}>
              Clear
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No parent</span>
        )}
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search parent issue"
          className="h-9 text-xs sm:h-7"
        />
        {search.length >= 2 ? (
          <ul className="max-h-40 overflow-auto rounded-md border border-border">
            {options.length === 0 ? (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">No matches</li>
            ) : (
              options.map((candidate) => (
                <li key={candidate._id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
                    onClick={() => void choose(candidate._id)}
                  >
                    <span className="shrink-0 font-mono text-muted-foreground">{candidate.identifier}</span>
                    <span className="min-w-0 truncate">{candidate.title}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

function MentionComposer({
  value,
  members,
  pending,
  onChange,
  onPendingChange,
  placeholder,
  menuPlacement = "down",
  ariaLabel,
  areaClassName,
}: {
  value: string;
  members: MentionMember[];
  pending: PendingMention[];
  onChange: (value: string) => void;
  onPendingChange: (pending: PendingMention[]) => void;
  placeholder?: string;
  menuPlacement?: "up" | "down";
  ariaLabel?: string;
  areaClassName?: string;
}) {
  const uploadImage = useUploadImage();
  const [caret, setCaret] = useState<EditorCaret | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [escaped, setEscaped] = useState(false);
  const query = caret ? findMentionQuery(caret.blockText, caret.caret) : null;
  const options = useMemo(
    () => (query ? filterMembers(members, query.query).slice(0, 8) : []),
    [members, query],
  );
  const open = Boolean(query) && options.length > 0 && !escaped;

  function selectMember(member: MentionMember) {
    if (!query || !caret) return;
    const token = mentionToken(member);
    caret.replace(query.start, query.end, `${token} `);
    onPendingChange([
      ...pending.filter((item) => item.userId !== member._id),
      { userId: member._id, token },
    ]);
    setActiveIndex(0);
    setEscaped(false);
  }

  function onTextKeyDown(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % options.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + options.length) % options.length);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      const member = options[activeIndex];
      if (member) selectMember(member);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setEscaped(true);
    }
  }

  return (
    <div className="relative">
      <MarkdownEditor
        value={value}
        mentions={pendingMarks(pending)}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        areaClassName={areaClassName}
        variant="field"
        onChange={(next) => {
          onChange(next);
          setActiveIndex(0);
          setEscaped(false);
        }}
        onCaretContext={setCaret}
        onPointerDown={() => setEscaped(false)}
        onKeyDown={onTextKeyDown}
        uploadImage={uploadImage}
      />
      {open ? (
        <ul
          className={cn(
            "absolute z-20 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md",
            menuPlacement === "up" ? "bottom-full mb-1" : "mt-1",
          )}
          role="listbox"
        >
          {options.map((member, index) => (
            <li key={member._id}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                  index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectMember(member);
                }}
              >
                <UserAvatar
                  user={{
                    name: member.name ?? null,
                    email: member.email ?? null,
                    image: member.image ?? null,
                  }}
                />
                <span className="min-w-0 truncate">{memberMentionLabel(member)}</span>
                {member.email ? (
                  <span className="ml-auto truncate text-xs text-muted-foreground">{member.email}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function openLinkedIssue(
  event: React.MouseEvent<HTMLAnchorElement>,
  issueId: Id<"issues">,
  openIssue: (issueId: Id<"issues">) => void,
) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  openIssue(issueId);
}

function InlineTitle({ issueId, title }: { issueId: Id<"issues">; title: string }) {
  const update = useMutation(api.issues.update);
  const [value, setValue] = useState(title);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setValue(title);
  }, [title]);

  async function save() {
    const next = value.trim();
    if (!next || next === title) {
      setValue(title);
      dirty.current = false;
      return;
    }
    try {
      await update({ issueId, title: next });
      dirty.current = false;
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <input
      aria-label="Title"
      value={value}
      onChange={(event) => {
        dirty.current = true;
        setValue(event.target.value);
      }}
      onBlur={() => void save()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className="w-full bg-transparent text-xl font-medium tracking-tight outline-none"
    />
  );
}

function InlineDescription({
  issueId,
  description,
}: {
  issueId: Id<"issues">;
  description: string;
}) {
  const update = useMutation(api.issues.update);
  const latest = useRef(description);
  const saved = useRef(description);
  const writing = useRef(false);
  const queued = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const updateRef = useRef(update);
  const issueRef = useRef(issueId);
  const uploadImage = useUploadImage();
  const [value, setValue] = useState(description);
  updateRef.current = update;
  issueRef.current = issueId;

  useEffect(() => {
    if (latest.current !== saved.current) return;
    latest.current = description;
    saved.current = description;
    setValue(description);
  }, [description]);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      const next = latest.current;
      if (next !== saved.current && next.length <= 20000) {
        void updateRef.current({ issueId: issueRef.current, description: next }).catch(() => undefined);
      }
    };
  }, []);

  async function persist(next: string) {
    queued.current = next;
    if (writing.current) return;
    writing.current = true;
    try {
      while (queued.current !== null) {
        const pending = queued.current;
        queued.current = null;
        if (pending === saved.current) continue;
        if (pending.length > 20000) {
          toast.error("Description is too long");
          continue;
        }
        await updateRef.current({ issueId: issueRef.current, description: pending });
        saved.current = pending;
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      writing.current = false;
      if (queued.current !== null && queued.current !== saved.current) void persist(queued.current);
    }
  }

  function schedule(next: string) {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void persist(next);
    }, 450);
  }

  return (
    <div className="mt-1 lg:mt-2">
      <MarkdownEditor
        value={value}
        variant="plain"
        placeholder="Add a description…"
        ariaLabel="Description"
        onChange={(next) => {
          latest.current = next;
          setValue(next);
          schedule(next);
        }}
        onBlur={() => {
          if (timer.current) window.clearTimeout(timer.current);
          void persist(latest.current);
        }}
        onSubmit={() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        }}
        uploadImage={uploadImage}
      />
    </div>
  );
}
