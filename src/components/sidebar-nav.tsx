"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import UserAvatar from "@/components/user-avatar";
import { errorMessage, projectColor } from "@/lib/format";
import type { ViewItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import {
  ChevronDown,
  CircleUser,
  Inbox,
  Kanban,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

export default function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, workspaces, setWorkspaceId, me, openCreate } = useWorkspace();
  const roomy = Boolean(onNavigate);
  const projects = useQuery(
    api.projects.list,
    workspace ? { workspaceId: workspace._id } : "skip",
  );
  const views = useQuery(api.views.list, workspace ? { workspaceId: workspace._id } : "skip");
  const pruneSeeded = useMutation(api.views.pruneSeeded);
  const prunedWorkspace = useRef<Id<"workspaces"> | null>(null);
  const { signOut } = useAuthActions();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!workspace || prunedWorkspace.current === workspace._id) return;
    let cancelled = false;
    void pruneSeeded({ workspaceId: workspace._id })
      .then(() => {
        if (!cancelled) prunedWorkspace.current = workspace._id;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workspace, pruneSeeded]);

  async function logout() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center gap-2 px-3 py-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
          L
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-1 text-left text-sm font-medium hover:bg-white/5"
              />
            }
          >
            <span className="truncate">{workspace?.name ?? "Workspace"}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            {workspaces?.map((item) => (
              <DropdownMenuItem key={item._id} onClick={() => setWorkspaceId(item._id)}>
                <span className="truncate">{item.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {onNavigate ? (
          <button
            type="button"
            aria-label="Close menu"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
            onClick={onNavigate}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => openCreate(projects?.[0] ? { projectId: projects[0]._id } : undefined)}
        className={cn(
          "mx-3 mb-2 flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-white/5 hover:text-foreground",
          roomy && "min-h-11",
        )}
      >
        <SquarePen className="size-3.5" />
        New issue
        <span className="ml-auto hidden font-mono text-[10px] lg:inline">⌘K</span>
      </button>

      <nav className="space-y-0.5 px-2">
        <NavLink href="/" active={pathname === "/"} onNavigate={onNavigate} roomy={roomy}>
          <Inbox className="size-3.5" />
          Inbox
        </NavLink>
        <NavLink
          href="/my-issues"
          active={pathname === "/my-issues"}
          onNavigate={onNavigate}
          roomy={roomy}
        >
          <CircleUser className="size-3.5" />
          My Issues
        </NavLink>
        <NavLink href="/projects" active={pathname === "/projects"} onNavigate={onNavigate} roomy={roomy}>
          <Kanban className="size-3.5" />
          Projects
        </NavLink>
        <NavLink href="/cycles" active={pathname === "/cycles"} onNavigate={onNavigate} roomy={roomy}>
          <RefreshCw className="size-3.5" />
          Cycles
        </NavLink>
      </nav>

      <div className="mt-4 px-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Projects
      </div>
      <div className="mt-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-3">
        <div className="space-y-0.5">
          {projects?.map((project) => {
            const href = `/projects/${project._id}`;
            return (
              <Link
                key={project._id}
                href={href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-white/5 hover:text-foreground",
                  roomy && "min-h-11",
                  pathname.startsWith(href) && "bg-white/6 text-foreground",
                )}
              >
                <span
                  className="size-2 rounded-sm"
                  style={{ backgroundColor: projectColor(project.key) }}
                />
                <span className="truncate">{project.name}</span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {project.key}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setCreating(true)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-white/5 hover:text-foreground",
              roomy && "min-h-11",
            )}
          >
            <Plus className="size-3.5" />
            New project
          </button>
        </div>

        <div>
          <div className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Views
          </div>
          {views?.map((view) => (
            <ViewRow
              key={view._id}
              view={view}
              active={pathname === `/views/${view._id}`}
              onNavigate={onNavigate}
              roomy={roomy}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/5",
                  roomy && "min-h-11",
                )}
              />
            }
          >
            <UserAvatar user={me ?? null} />
            <span className="min-w-0 flex-1 truncate text-[13px]">
              {me?.name || me?.email || "Account"}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-52">
            <DropdownMenuItem
              onClick={() => {
                onNavigate?.();
                router.push("/settings");
              }}
            >
              <Settings className="size-3.5" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void logout()}>
              <LogOut className="size-3.5" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {workspace ? (
        <CreateProjectDialog
          open={creating}
          workspaceId={workspace._id}
          onOpenChange={setCreating}
        />
      ) : null}
    </div>
  );
}

function ViewRow({
  view,
  active,
  onNavigate,
  roomy,
}: {
  view: ViewItem;
  active: boolean;
  onNavigate?: () => void;
  roomy: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const rename = useMutation(api.views.rename);
  const remove = useMutation(api.views.remove);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [name, setName] = useState(view.name);
  const [pending, setPending] = useState(false);
  const href = `/views/${view._id}`;

  async function onRename(event: React.FormEvent) {
    event.preventDefault();
    const parsed = viewNameSchema.safeParse(name);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Enter a view name");
      return;
    }
    if (parsed.data === view.name) {
      setRenaming(false);
      return;
    }
    setPending(true);
    try {
      await rename({ viewId: view._id, name: parsed.data });
      setRenaming(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    setPending(true);
    try {
      await remove({ viewId: view._id });
      setConfirmingDelete(false);
      if (pathname === href) router.push("/");
      onNavigate?.();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div
        className={cn(
          "flex items-center rounded-md text-[13px] text-muted-foreground hover:bg-white/5 hover:text-foreground",
          roomy && "min-h-11",
          active && "bg-white/6 text-foreground",
        )}
      >
        <Link href={href} onClick={onNavigate} className="min-w-0 flex-1 truncate px-2 py-1.5">
          {view.name}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={`Actions for ${view.name}`}
                className={cn(
                  "mr-1 inline-flex shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground",
                  roomy ? "size-10" : "size-6",
                )}
              />
            }
          >
            <MoreHorizontal className={roomy ? "size-4" : "size-3.5"} />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-40">
            <DropdownMenuItem
              onClick={() => {
                setName(view.name);
                setRenaming(true);
              }}
            >
              <Pencil className="size-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmingDelete(true)}>
              <Trash2 className="size-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename view</DialogTitle>
          </DialogHeader>
          <form onSubmit={onRename} className="space-y-3">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="View name"
              placeholder="View name"
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete view</DialogTitle>
            <DialogDescription>
              Delete “{view.name}”? Issues in the workspace stay where they are.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmingDelete(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void onDelete()} disabled={pending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NavLink({
  href,
  active,
  children,
  onNavigate,
  roomy,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  onNavigate?: () => void;
  roomy?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-white/5 hover:text-foreground",
        roomy && "min-h-11",
        active && "bg-white/6 text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function CreateProjectDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: Id<"workspaces">;
}) {
  const create = useMutation(api.projects.create);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = zName.safeParse(name);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Enter a name");
      return;
    }
    setPending(true);
    try {
      const projectId = await create({
        workspaceId,
        name: parsed.data,
        description,
      });
      setName("");
      setDescription("");
      onOpenChange(false);
      router.push(`/projects/${projectId}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Project name"
            autoFocus
          />
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const zName = z.string().trim().min(1, "Enter a project name").max(80, "Name is too long");
const viewNameSchema = z.string().trim().min(1, "Enter a view name").max(80, "Name is too long");
