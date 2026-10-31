"use client";

import IssueComposer from "@/components/issue-composer";
import SidebarNav from "@/components/sidebar-nav";
import WorkspaceProvider, { useWorkspace } from "@/components/workspace-provider";
import { Menu, SquarePen } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { openCreate, composer, workspaces, workspace } = useWorkspace();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!composer) openCreate();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composer, openCreate]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  if (workspaces === undefined) {
    return (
      <div className="grid h-dvh place-items-center px-4 text-sm text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <aside className="hidden w-[240px] shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
        <SidebarNav />
      </aside>
      {navOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col border-r border-border bg-sidebar pt-[env(safe-area-inset-top)] shadow-xl"
          >
            <SidebarNav onNavigate={() => setNavOpen(false)} />
          </aside>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-1 border-b border-border bg-sidebar px-1 pt-[env(safe-area-inset-top)] lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={navOpen}
            className="inline-flex size-11 items-center justify-center rounded-md text-foreground hover:bg-white/5"
            onClick={() => setNavOpen(true)}
          >
            <Menu className="size-4" />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {workspace?.name ?? "Linear"}
          </span>
          <button
            type="button"
            aria-label="New issue"
            className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
            onClick={() => openCreate()}
          >
            <SquarePen className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
      <IssueComposer />
    </div>
  );
}
