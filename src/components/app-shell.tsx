"use client";

import IssueComposer from "@/components/issue-composer";
import SidebarNav from "@/components/sidebar-nav";
import WorkspaceProvider, { useWorkspace } from "@/components/workspace-provider";
import { useEffect } from "react";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { openCreate, composer, workspaces } = useWorkspace();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!composer) openCreate();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composer, openCreate]);

  if (workspaces === undefined) {
    return (
      <div className="grid h-screen place-items-center text-sm text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-[240px] shrink-0 border-r border-border bg-sidebar">
        <SidebarNav />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
      <IssueComposer />
    </div>
  );
}
