"use client";

import { api } from "@convex/_generated/api";
import { ISSUE_STATUSES, type IssueStatus } from "@convex/model";
import IssueList from "@/components/issue-list";
import StatusIcon, { statusLabel } from "@/components/status-icon";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import type { IssueItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

type Mode = "assigned" | "created";

export default function MyIssuesScreen() {
  const { workspace, openCreate } = useWorkspace();
  const [mode, setMode] = useState<Mode>("assigned");
  const issues = useQuery(
    api.issues.mine,
    workspace ? { workspaceId: workspace._id, mode } : "skip",
  );

  const groups = useMemo(() => groupByStatus(issues), [issues]);
  const empty =
    mode === "assigned" ? "No issues assigned to you." : "You have not created any issues.";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-12 items-center gap-2 border-b border-border px-3 sm:gap-3 sm:px-4">
        <h1 className="text-sm font-medium">My Issues</h1>
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          <ModeTab active={mode === "assigned"} onClick={() => setMode("assigned")}>
            Assigned
          </ModeTab>
          <ModeTab active={mode === "created"} onClick={() => setMode("created")}>
            Created
          </ModeTab>
        </div>
        <Button type="button" size="sm" className="ml-auto h-9 sm:h-7" onClick={() => openCreate()}>
          <Plus className="size-3.5" />
          <span className="hidden sm:inline">Issue</span>
          <span className="sm:hidden">New</span>
        </Button>
      </header>
      {issues === undefined ? (
        <div className="px-4 py-8 text-sm text-muted-foreground">Loading issues…</div>
      ) : groups.length === 0 ? (
        <div className="px-4 py-16 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)]">
          {groups.map(({ status, items }) => (
            <section key={status} className="border-b border-border/70 last:border-b-0">
              <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background px-3 py-2 sm:px-4">
                <StatusIcon status={status} />
                <span className="text-[13px] font-medium">{statusLabel(status)}</span>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <IssueList issues={items} empty={empty} embedded />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground",
        active && "bg-white/8 text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function groupByStatus(issues: IssueItem[] | undefined) {
  if (!issues) return [];
  const byStatus = new Map<IssueStatus, IssueItem[]>();
  for (const status of ISSUE_STATUSES) {
    byStatus.set(status, []);
  }
  for (const issue of issues) {
    byStatus.get(issue.status)?.push(issue);
  }
  return ISSUE_STATUSES.flatMap((status) => {
    const items = byStatus.get(status) ?? [];
    return items.length > 0 ? [{ status, items }] : [];
  });
}
