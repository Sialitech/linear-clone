"use client";

import { api } from "@convex/_generated/api";
import IssueList from "@/components/issue-list";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";

export default function InboxScreen() {
  const { workspace, openCreate } = useWorkspace();
  const issues = useQuery(api.issues.inbox, workspace ? { workspaceId: workspace._id } : "skip");
  const mentions = useQuery(
    api.issues.mentions,
    workspace ? { workspaceId: workspace._id } : "skip",
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-12 items-center gap-2 border-b border-border px-3 sm:gap-3 sm:px-4">
        <h1 className="text-sm font-medium">Inbox</h1>
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">
          Assigned to you, still open
        </span>
        <Button type="button" size="sm" className="ml-auto h-9 sm:h-7" onClick={() => openCreate()}>
          <Plus className="size-3.5" />
          <span className="hidden sm:inline">Issue</span>
          <span className="sm:hidden">New</span>
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)]">
        <IssueList issues={issues} empty="Nothing assigned to you. Inbox zero." nested />
        <section className="border-t border-border">
          <div className="flex min-h-10 items-center px-3 sm:px-4">
            <h2 className="text-sm font-medium">Mentions</h2>
          </div>
          <IssueList issues={mentions} empty="No mentions yet." nested />
        </section>
      </div>
    </div>
  );
}
