"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import UserAvatar from "@/components/user-avatar";
import { formatDue } from "@/lib/format";
import { useQuery } from "convex/react";

type ActivityType =
  | "created"
  | "title_changed"
  | "description_changed"
  | "status_changed"
  | "priority_changed"
  | "assignee_changed"
  | "due_date_set"
  | "due_date_changed"
  | "due_date_cleared"
  | "labels_added"
  | "labels_removed"
  | "comment_added"
  | "comment_edited"
  | "comment_deleted";

function activitySentence(
  type: ActivityType,
  fromLabel: string | null,
  toLabel: string | null,
) {
  switch (type) {
    case "created":
      return "created the issue";
    case "title_changed":
      return "changed the title";
    case "description_changed":
      return "changed the description";
    case "status_changed":
      return `changed status from ${fromLabel ?? "Unknown"} to ${toLabel ?? "Unknown"}`;
    case "priority_changed":
      return `changed priority from ${fromLabel ?? "Unknown"} to ${toLabel ?? "Unknown"}`;
    case "assignee_changed":
      return `changed assignee from ${fromLabel ?? "Unassigned"} to ${toLabel ?? "Unassigned"}`;
    case "due_date_set":
      return `set the due date to ${toLabel ?? "Unknown"}`;
    case "due_date_changed":
      return `changed the due date from ${fromLabel ?? "Unknown"} to ${toLabel ?? "Unknown"}`;
    case "due_date_cleared":
      return "cleared the due date";
    case "labels_added":
      return `added ${labelPhrase(toLabel)}`;
    case "labels_removed":
      return `removed ${labelPhrase(fromLabel)}`;
    case "comment_added":
      return "commented";
    case "comment_edited":
      return "edited a comment";
    case "comment_deleted":
      return "deleted a comment";
    default:
      return "updated the issue";
  }
}

function labelPhrase(value: string | null) {
  if (!value) return "a label";
  const count = value.split(", ").filter(Boolean).length;
  return count === 1 ? `label ${value}` : `labels ${value}`;
}

export default function IssueActivity({ issueId }: { issueId: Id<"issues"> }) {
  const activities = useQuery(api.activities.list, { issueId });

  if (activities === undefined) {
    return (
      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium">Activity</h2>
        <p className="text-sm text-muted-foreground">Loading activity…</p>
      </section>
    );
  }

  if (activities.length === 0) {
    return null;
  }

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-medium">Activity</h2>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          Live
        </span>
      </div>
      <div className="space-y-3">
        {activities.map((item) => {
          const actorName = item.actor?.name || item.actor?.email || "Someone";
          const sentence = activitySentence(item.type, item.fromLabel, item.toLabel);
          return (
            <article key={item._id} className="flex gap-2">
              <UserAvatar user={item.actor} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-foreground/90">
                  <span className="font-medium text-foreground">{actorName}</span>{" "}
                  {sentence}
                </p>
                <p className="text-xs text-muted-foreground">{formatDue(item.createdAt)}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
