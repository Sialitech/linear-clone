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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 items-center gap-3 border-b border-border px-4">
        <h1 className="text-sm font-medium">Inbox</h1>
        <span className="text-xs text-muted-foreground">Assigned to you, still open</span>
        <Button type="button" size="sm" className="ml-auto" onClick={() => openCreate()}>
          <Plus className="size-3.5" />
          Issue
        </Button>
      </header>
      <IssueList issues={issues} empty="Nothing assigned to you. Inbox zero." />
    </div>
  );
}
