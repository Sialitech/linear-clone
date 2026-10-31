"use client";

import { api } from "@convex/_generated/api";
import { ISSUE_STATUSES, PRIORITIES } from "@convex/model";
import PriorityIcon, { priorityLabel } from "@/components/priority-icon";
import StatusIcon, { statusLabel } from "@/components/status-icon";
import { useWorkspace } from "@/components/workspace-provider";
import { errorMessage } from "@/lib/format";
import type { IssueItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useMutation } from "convex/react";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

type MenuState = {
  x: number;
  y: number;
  submenu: "status" | "priority" | null;
};

export default function IssueContextMenu({
  issue,
  children,
}: {
  issue: IssueItem;
  children: ReactNode;
}) {
  const router = useRouter();
  const { openEdit } = useWorkspace();
  const update = useMutation(api.issues.update);
  const remove = useMutation(api.issues.remove);
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    if (!menu) return;
    function close() {
      setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  async function patch(args: Parameters<typeof update>[0]) {
    setMenu(null);
    try {
      await update(args);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onDelete() {
    setMenu(null);
    if (!window.confirm(`Delete ${issue.identifier}?`)) return;
    try {
      await remove({ issueId: issue._id });
      toast.success(`${issue.identifier} deleted`);
      if (window.location.pathname === `/issues/${issue._id}`) {
        router.push(`/projects/${issue.projectId}`);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function copyLink() {
    setMenu(null);
    const url = `${window.location.origin}/issues/${issue._id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const left = menu ? Math.min(menu.x, window.innerWidth - 220) : 0;
  const top = menu ? Math.min(menu.y, window.innerHeight - 280) : 0;

  return (
    <div
      className="contents"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setMenu({ x: event.clientX, y: event.clientY, submenu: null });
      }}
    >
      {children}
      {menu && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-50 min-w-48 rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
              style={{ left, top }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <MenuButton
                onClick={() => {
                  setMenu(null);
                  router.push(`/issues/${issue._id}`);
                }}
              >
                Open {issue.identifier}
              </MenuButton>
              <MenuButton
                onClick={() => {
                  setMenu(null);
                  openEdit(issue._id);
                }}
              >
                <Pencil />
                Edit
              </MenuButton>
              <MenuButton onClick={() => void copyLink()}>
                <Copy />
                Copy link
              </MenuButton>
              <div className="-mx-1 my-1 h-px bg-border" />
              <MenuButton
                onMouseEnter={() => setMenu((current) => (current ? { ...current, submenu: "status" } : current))}
              >
                <StatusIcon status={issue.status} />
                Status
                <span className="ml-auto text-xs text-muted-foreground">{statusLabel(issue.status)}</span>
              </MenuButton>
              <Submenu open={menu.submenu === "status"}>
                {ISSUE_STATUSES.map((status) => (
                  <MenuButton
                    key={status}
                    active={status === issue.status}
                    onClick={() => void patch({ issueId: issue._id, status })}
                  >
                    <StatusIcon status={status} />
                    {statusLabel(status)}
                  </MenuButton>
                ))}
              </Submenu>
              <MenuButton
                onMouseEnter={() => setMenu((current) => (current ? { ...current, submenu: "priority" } : current))}
              >
                <PriorityIcon priority={issue.priority} />
                Priority
                <span className="ml-auto text-xs text-muted-foreground">{priorityLabel(issue.priority)}</span>
              </MenuButton>
              <Submenu open={menu.submenu === "priority"}>
                {PRIORITIES.map((priority) => (
                  <MenuButton
                    key={priority}
                    active={priority === issue.priority}
                    onClick={() => void patch({ issueId: issue._id, priority })}
                  >
                    <PriorityIcon priority={priority} />
                    {priorityLabel(priority)}
                  </MenuButton>
                ))}
              </Submenu>
              <div className="-mx-1 my-1 h-px bg-border" />
              <MenuButton destructive onClick={() => void onDelete()}>
                <Trash2 />
                Delete
              </MenuButton>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function Submenu({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div
        className={cn(
          "overflow-hidden transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="mb-1 ml-2 rounded-md bg-white/[0.03] p-1">
          {children}
        </div>
      </div>
    </div>
  );
}

function MenuButton({
  children,
  onClick,
  onMouseEnter,
  active,
  destructive,
}: {
  children: ReactNode;
  onClick?: () => void;
  onMouseEnter?: () => void;
  active?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground [&_svg]:size-3.5",
        active && "bg-accent/60",
        destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}
