"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { TriageAction } from "@convex/model";
import IssueSkeleton from "@/components/issue-skeleton";
import PriorityIcon from "@/components/priority-icon";
import StatusIcon from "@/components/status-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/components/workspace-provider";
import { errorMessage, formatDue, formatRelative } from "@/lib/format";
import type { IssueItem } from "@/lib/types";
import { useMutation, useQuery } from "convex/react";
import { addDays, startOfDay } from "date-fns";
import { AlarmClock, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function snoozeFromNow(days: number) {
  return startOfDay(addDays(new Date(), days)).getTime();
}

export default function TriageScreen() {
  const { workspace, openCreate, openIssue } = useWorkspace();
  const queue = useQuery(
    api.issues.triageQueue,
    workspace ? { workspaceId: workspace._id } : "skip",
  );
  const decide = useMutation(api.issues.triage);
  const [pendingId, setPendingId] = useState<Id<"issues"> | null>(null);

  async function act(issueId: Id<"issues">, action: TriageAction, snoozedUntil?: number) {
    setPendingId(issueId);
    try {
      await decide({
        issueId,
        action,
        ...(snoozedUntil !== undefined ? { snoozedUntil } : {}),
      });
      toast.success(
        action === "accept"
          ? "Accepted into Todo"
          : action === "decline"
            ? "Declined"
            : action === "snooze"
              ? "Snoozed"
              : "Back in triage",
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-12 items-center gap-2 border-b border-border px-3 sm:gap-3 sm:px-4">
        <h1 className="text-sm font-medium">Triage</h1>
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">
          {queue ? `${queue.waiting.length} waiting` : "Incoming issues"}
        </span>
        <Button
          type="button"
          size="sm"
          className="ml-auto h-9 sm:h-7"
          onClick={() => openCreate({ status: "triage" })}
        >
          <Plus className="size-3.5" />
          <span className="hidden sm:inline">Issue</span>
          <span className="sm:hidden">New</span>
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)]">
        {queue === undefined ? (
          <IssueSkeleton />
        ) : queue.waiting.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">
            {queue.snoozed.length > 0
              ? "Nothing is waiting. Snoozed issues are listed below."
              : "Triage is clear. New issues can start here, or set an existing issue to Triage."}
          </p>
        ) : (
          <ul>
            {queue.waiting.map((issue) => (
              <TriageRow
                key={issue._id}
                issue={issue}
                pending={pendingId === issue._id}
                onOpen={() => openIssue(issue._id)}
                onAccept={() => void act(issue._id, "accept")}
                onDecline={() => void act(issue._id, "decline")}
                onSnooze={(until) => void act(issue._id, "snooze", until)}
              />
            ))}
          </ul>
        )}
        {queue && queue.snoozed.length > 0 ? (
          <section className="border-t border-border">
            <div className="flex min-h-10 items-center px-3 sm:px-4">
              <h2 className="text-sm font-medium">Snoozed</h2>
              <span className="ml-2 text-xs text-muted-foreground">{queue.snoozed.length}</span>
            </div>
            <ul>
              {queue.snoozed.map((issue) => (
                <li
                  key={issue._id}
                  className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2 sm:px-4"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => openIssue(issue._id)}
                  >
                    <StatusIcon status="triage" />
                    <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                      {issue.identifier}
                    </span>
                    <span className="truncate text-[13px]">{issue.title}</span>
                  </button>
                  <span className="text-xs text-muted-foreground">
                    Until {issue.snoozedUntil ? formatDue(issue.snoozedUntil) : "later"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 sm:h-7"
                    disabled={pendingId === issue._id}
                    onClick={() => void act(issue._id, "send")}
                  >
                    Unsnooze
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function TriageRow({
  issue,
  pending,
  onOpen,
  onAccept,
  onDecline,
  onSnooze,
}: {
  issue: IssueItem;
  pending: boolean;
  onOpen: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onSnooze: (until: number) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2 sm:px-4">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onOpen}>
        <PriorityIcon priority={issue.priority} />
        <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{issue.identifier}</span>
        <span className="min-w-0 flex-1 truncate text-[13px]">{issue.title}</span>
      </button>
      <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">{issue.projectKey}</span>
      <span className="text-xs text-muted-foreground">{formatRelative(issue.createdAt)}</span>
      <div className="flex items-center gap-1">
        <Button type="button" size="sm" className="h-8 sm:h-7" disabled={pending} onClick={onAccept}>
          Accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 sm:h-7"
          disabled={pending}
          onClick={onDecline}
        >
          Decline
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 sm:h-7"
                disabled={pending}
                aria-label={`Snooze ${issue.identifier}`}
              />
            }
          >
            <AlarmClock className="size-3.5" />
            Snooze
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onSnooze(snoozeFromNow(1))}>Tomorrow</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSnooze(snoozeFromNow(3))}>In 3 days</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSnooze(snoozeFromNow(7))}>Next week</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
