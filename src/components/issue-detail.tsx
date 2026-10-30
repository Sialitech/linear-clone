"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ISSUE_STATUSES, PRIORITIES } from "@convex/model";
import LabelChip from "@/components/label-chip";
import PriorityIcon, { priorityLabel } from "@/components/priority-icon";
import StatusIcon, { statusLabel } from "@/components/status-icon";
import UserAvatar from "@/components/user-avatar";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { dateInputToTimestamp, dateInputValue, errorMessage, formatDue, isOverdue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { z } from "zod";

const commentSchema = z.string().trim().min(1, "Write a comment").max(10000);

export default function IssueDetail({ issueId }: { issueId: string }) {
  const id = issueId as Id<"issues">;
  const router = useRouter();
  const { workspace, openEdit, me } = useWorkspace();
  const issue = useQuery(api.issues.get, { issueId: id });
  const comments = useQuery(api.comments.list, issue ? { issueId: id } : "skip");
  const members = useQuery(
    api.users.listMembers,
    workspace ? { workspaceId: workspace._id } : "skip",
  );
  const update = useMutation(api.issues.update);
  const remove = useMutation(api.issues.remove);
  const createComment = useMutation(api.comments.create);
  const updateComment = useMutation(api.comments.update);
  const removeComment = useMutation(api.comments.remove);
  const [comment, setComment] = useState("");
  const [editingComment, setEditingComment] = useState<Id<"comments"> | null>(null);
  const [editingText, setEditingText] = useState("");

  async function patch(args: Parameters<typeof update>[0]) {
    try {
      await update(args);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onComment(event: React.FormEvent) {
    event.preventDefault();
    const parsed = commentSchema.safeParse(comment);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Write a comment");
      return;
    }
    try {
      await createComment({ issueId: id, content: parsed.data });
      setComment("");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onDelete() {
    if (!window.confirm("Delete this issue?")) return;
    try {
      await remove({ issueId: id });
      router.push(issue ? `/projects/${issue.projectId}` : "/");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (issue === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading issue…</div>;
  }
  if (issue === null) {
    return <div className="p-6 text-sm text-muted-foreground">Issue not found.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 items-center gap-3 border-b border-border px-4">
        <Link href={`/projects/${issue.projectId}`} className="font-mono text-xs text-muted-foreground hover:text-foreground">
          {issue.identifier}
        </Link>
        <span className="text-xs text-muted-foreground">{issue.projectName}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(issue._id)}>
            Edit
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void onDelete()}>
            Delete
          </Button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-h-0 overflow-auto px-6 py-5">
          <h1 className="text-xl font-medium tracking-tight">{issue.title}</h1>
          <div className="prose-invert mt-4 text-sm leading-6 text-foreground/90 [&_code]:rounded [&_code]:bg-white/8 [&_code]:px-1 [&_h1]:mb-2 [&_h1]:text-lg [&_h2]:mb-2 [&_h2]:text-base [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
            {issue.description ? (
              <ReactMarkdown>{issue.description}</ReactMarkdown>
            ) : (
              <p className="text-muted-foreground">No description yet.</p>
            )}
          </div>
          <section className="mt-10">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-medium">Comments</h2>
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                Live
              </span>
            </div>
            <div className="space-y-4">
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
                          void updateComment({ commentId: item._id, content: parsed.data })
                            .then(() => setEditingComment(null))
                            .catch((error: unknown) => toast.error(errorMessage(error)));
                        }}
                      >
                        <Textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} />
                        <Button type="submit" size="sm">Save</Button>
                      </form>
                    ) : (
                      <p className="mt-1 text-sm whitespace-pre-wrap">{item.content}</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <form onSubmit={onComment} className="mt-4 space-y-2">
              <Textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Leave a comment"
              />
              <Button type="submit" size="sm">Comment</Button>
            </form>
          </section>
        </div>
        <aside className="space-y-4 border-t border-border px-4 py-4 lg:border-t-0 lg:border-l">
          <Field label="Status">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>
                <StatusIcon status={issue.status} />
                {statusLabel(issue.status)}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {ISSUE_STATUSES.map((status) => (
                  <DropdownMenuItem key={status} onClick={() => void patch({ issueId: id, status })}>
                    <StatusIcon status={status} />
                    {statusLabel(status)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </Field>
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
                "h-7 rounded-md border border-border bg-transparent px-2 text-xs",
                issue.dueDate && isOverdue(issue.dueDate, issue.status) && "text-destructive",
              )}
            />
          </Field>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}
