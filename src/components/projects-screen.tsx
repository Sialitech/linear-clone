"use client";

import { api } from "@convex/_generated/api";
import { PROJECT_STATUS_LABELS } from "@convex/model";
import { useWorkspace } from "@/components/workspace-provider";
import { projectColor } from "@/lib/format";
import { useQuery } from "convex/react";
import Link from "next/link";

export default function ProjectsScreen() {
  const { workspace } = useWorkspace();
  const projects = useQuery(api.projects.list, workspace ? { workspaceId: workspace._id } : "skip");

  return (
    <div className="h-full overflow-auto pb-[env(safe-area-inset-bottom)]">
      <header className="flex min-h-12 items-center border-b border-border px-3 sm:px-4">
        <h1 className="text-sm font-medium">Projects</h1>
      </header>
      <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
        {projects?.map((project) => (
          <Link
            key={project._id}
            href={`/projects/${project._id}`}
            className="rounded-lg border border-border px-4 py-3 hover:bg-white/[0.03]"
          >
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: projectColor(project.key) }} />
              <span className="min-w-0 truncate text-sm font-medium">{project.name}</span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">{project.key}</span>
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
              {project.description || "No description"}
            </p>
            <p className="mt-3 text-[11px] text-muted-foreground">{PROJECT_STATUS_LABELS[project.status]}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
