"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ISSUE_STATUSES, PRIORITIES } from "@convex/model";
import PriorityIcon, { priorityLabel } from "@/components/priority-icon";
import StatusIcon, { statusLabel } from "@/components/status-icon";
import UserAvatar from "@/components/user-avatar";
import { useWorkspace } from "@/components/workspace-provider";
import {
  dateInputToTimestamp,
  dateInputValue,
  endOfThisWeekTimestamp,
  errorMessage,
  formatMenuDate,
  inOneWeekTimestamp,
  parseDueQuery,
  projectColor,
  sameLocalDay,
  tomorrowTimestamp,
} from "@/lib/format";
import type { IssueItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Box,
  Calendar,
  CalendarX2,
  Check,
  ChevronRight,
  Copy,
  Pencil,
  Tag,
  Trash2,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

type Submenu = "status" | "priority" | "assignee" | "due" | "labels" | "project";

type MenuState = {
  x: number;
  y: number;
  submenu: Submenu | null;
};

const MENU_WIDTH = 240;

export default function IssueContextMenu({
  issue,
  children,
  enableTouchMenu = false,
}: {
  issue: IssueItem;
  children: ReactNode;
  enableTouchMenu?: boolean;
}) {
  const router = useRouter();
  const { openEdit, me } = useWorkspace();
  const update = useMutation(api.issues.update);
  const remove = useMutation(api.issues.remove);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [labelOverride, setLabelOverride] = useState<Id<"labels">[] | null>(null);
  const [dueError, setDueError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const openedAt = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const dueInputRef = useRef<HTMLInputElement>(null);
  const customDateRef = useRef<HTMLInputElement>(null);
  const onDeleteRef = useRef<() => void>(() => {});
  const hoverTimer = useRef<number | null>(null);
  const open = menu !== null;
  const members = useQuery(api.users.listMembers, open ? { workspaceId: issue.workspaceId } : "skip");
  const labels = useQuery(api.labels.list, open ? { workspaceId: issue.workspaceId } : "skip");
  const projects = useQuery(api.projects.list, open ? { workspaceId: issue.workspaceId } : "skip");
  const selectedLabelIds = labelOverride ?? issue.labels.map((label) => label._id);

  function cancelPress() {
    if (!press.current) return;
    window.clearTimeout(press.current.timer);
    press.current = null;
  }

  function openMenu(x: number, y: number) {
    openedAt.current = Date.now();
    setDueError(null);
    setCustomOpen(false);
    setLabelOverride(null);
    setMenu({ x, y, submenu: null });
  }

  function onPointerDown(event: React.PointerEvent) {
    if (!enableTouchMenu || event.pointerType === "mouse") return;
    cancelPress();
    const x = event.clientX;
    const y = event.clientY;
    const timer = window.setTimeout(() => {
      press.current = null;
      suppressClick.current = true;
      openMenu(x, y);
    }, 450);
    press.current = { timer, x, y };
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!press.current) return;
    const moved =
      Math.abs(event.clientX - press.current.x) > 8 || Math.abs(event.clientY - press.current.y) > 8;
    if (moved) cancelPress();
  }

  function cancelHover() {
    if (hoverTimer.current === null) return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }

  function showSubmenu(submenu: Submenu) {
    setDueError(null);
    if (submenu !== "due") setCustomOpen(false);
    setMenu((current) => (current ? { ...current, submenu } : current));
  }

  function scheduleSubmenu(submenu: Submenu) {
    cancelHover();
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      showSubmenu(submenu);
    }, 120);
  }

  function hideSubmenu() {
    cancelHover();
    setCustomOpen(false);
    setMenu((current) => (current?.submenu ? { ...current, submenu: null } : current));
  }

  useLayoutEffect(() => {
    if (!menu) return;
    const menuEl = menuRef.current;
    if (!menuEl) return;
    const margin = 8;
    const width = menuEl.offsetWidth;
    const height = menuEl.offsetHeight;
    const left = Math.max(margin, Math.min(menu.x, window.innerWidth - width - margin));
    const top = Math.max(margin, Math.min(menu.y, window.innerHeight - height - margin));
    menuEl.style.left = `${left}px`;
    menuEl.style.top = `${top}px`;

    const subEl = subRef.current;
    if (!subEl || !menu.submenu) return;
    const row = menuEl.querySelector<HTMLElement>(`[data-submenu="${menu.submenu}"]`);
    const anchor = row?.getBoundingClientRect().top ?? top;
    const subWidth = subEl.offsetWidth;
    const subHeight = subEl.offsetHeight;
    let subLeft = left + width + 4;
    if (subLeft + subWidth > window.innerWidth - margin) subLeft = left - subWidth - 4;
    subLeft = Math.max(margin, Math.min(subLeft, window.innerWidth - subWidth - margin));
    const subTop = Math.max(margin, Math.min(anchor - 4, window.innerHeight - subHeight - margin));
    subEl.style.left = `${subLeft}px`;
    subEl.style.top = `${subTop}px`;
    subEl.style.opacity = "1";
  }, [menu, members, labels, projects, customOpen, dueError, issue.dueDate, selectedLabelIds]);

  useEffect(() => {
    if (menu?.submenu !== "due") return;
    dueInputRef.current?.focus({ preventScroll: true });
  }, [menu?.submenu]);

  useEffect(() => {
    if (!menu) return;
    function close(event?: Event) {
      if (event && Date.now() - openedAt.current < 250) return;
      const target = event?.target;
      if (target instanceof Node) {
        if (menuRef.current?.contains(target) || subRef.current?.contains(target)) return;
      }
      setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu((current) => {
          if (!current) return null;
          if (current.submenu) return { ...current, submenu: null };
          return null;
        });
        return;
      }
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if ((event.key === "Delete" || event.key === "Backspace") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onDeleteRef.current();
        return;
      }
      const key = event.key.toLowerCase();
      const next: Submenu | null =
        key === "s" ? "status"
        : event.shiftKey && key === "p" ? "project"
        : key === "p" ? "priority"
        : key === "a" ? "assignee"
        : key === "l" ? "labels"
        : key === "d" ? "due"
        : null;
      if (!next) return;
      event.preventDefault();
      setDueError(null);
      if (next !== "due") setCustomOpen(false);
      setMenu((current) => (current ? { ...current, submenu: next } : current));
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

  useEffect(() => {
    return () => {
      cancelPress();
      cancelHover();
    };
  }, []);

  const labelKey = issue.labels.map((label) => label._id).join("\0");
  useEffect(() => {
    setLabelOverride(null);
  }, [labelKey]);

  async function patch(
    args: Omit<Parameters<typeof update>[0], "issueId">,
    options?: { keepOpen?: boolean },
  ) {
    if (!options?.keepOpen) setMenu(null);
    try {
      await update({ issueId: issue._id, ...args });
    } catch (error) {
      if (options?.keepOpen) setLabelOverride(null);
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

  onDeleteRef.current = () => {
    void onDelete();
  };

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

  function toggleLabel(labelId: Id<"labels">) {
    const next = selectedLabelIds.includes(labelId)
      ? selectedLabelIds.filter((id) => id !== labelId)
      : [...selectedLabelIds, labelId];
    if (next.length > 12) {
      toast.error("An issue can have at most 12 labels");
      return;
    }
    setLabelOverride(next);
    void patch({ labelIds: next }, { keepOpen: true });
  }

  function applyDue(timestamp: number | null) {
    void patch({ dueDate: timestamp });
  }

  function applyDueText(value: string) {
    const parsed = parseDueQuery(value);
    if (!parsed) {
      setDueError("Try 24h, 7 days, or Feb 9");
      return;
    }
    setDueError(null);
    applyDue(parsed);
  }

  const tomorrow = tomorrowTimestamp();
  const endOfWeek = endOfThisWeekTimestamp();
  const inOneWeek = inOneWeekTimestamp();
  const menuHeight = 380;
  const initialLeft = menu ? Math.max(8, Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8)) : 0;
  const initialTop = menu ? Math.max(8, Math.min(menu.y, window.innerHeight - menuHeight - 8)) : 0;

  return (
    <div
      className="block"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openMenu(event.clientX, event.clientY);
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {children}
      {menu && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                ref={menuRef}
                role="menu"
                className="fixed z-50 max-h-[min(70dvh,480px)] w-60 overflow-y-auto rounded-lg bg-popover p-1 text-[13px] text-popover-foreground shadow-md ring-1 ring-foreground/10"
                style={{ left: initialLeft, top: initialTop, width: MENU_WIDTH }}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.preventDefault()}
              >
                <MenuRow
                  icon={<StatusIcon status={issue.status} />}
                  label="Status"
                  shortcut="S"
                  submenu="status"
                  open={menu.submenu === "status"}
                  onOpen={() => scheduleSubmenu("status")}
                  onCancel={cancelHover}
                  onOpenNow={() => {
                    cancelHover();
                    showSubmenu("status");
                  }}
                />
                <MenuRow
                  icon={<PriorityIcon priority={issue.priority} />}
                  label="Priority"
                  shortcut="P"
                  submenu="priority"
                  open={menu.submenu === "priority"}
                  onOpen={() => scheduleSubmenu("priority")}
                  onCancel={cancelHover}
                  onOpenNow={() => {
                    cancelHover();
                    showSubmenu("priority");
                  }}
                />
                <MenuRow
                  icon={<User />}
                  label="Assignee"
                  shortcut="A"
                  submenu="assignee"
                  open={menu.submenu === "assignee"}
                  onOpen={() => scheduleSubmenu("assignee")}
                  onCancel={cancelHover}
                  onOpenNow={() => {
                    cancelHover();
                    showSubmenu("assignee");
                  }}
                />
                <MenuRow
                  icon={<Calendar />}
                  label="Due date"
                  shortcut="⇧D"
                  submenu="due"
                  open={menu.submenu === "due"}
                  onOpen={() => scheduleSubmenu("due")}
                  onCancel={cancelHover}
                  onOpenNow={() => {
                    cancelHover();
                    showSubmenu("due");
                  }}
                />
                <MenuRow
                  icon={<Tag />}
                  label="Labels"
                  shortcut="L"
                  submenu="labels"
                  open={menu.submenu === "labels"}
                  onOpen={() => scheduleSubmenu("labels")}
                  onCancel={cancelHover}
                  onOpenNow={() => {
                    cancelHover();
                    showSubmenu("labels");
                  }}
                />
                <MenuRow
                  icon={<Box />}
                  label="Project"
                  shortcut="⇧P"
                  submenu="project"
                  open={menu.submenu === "project"}
                  onOpen={() => scheduleSubmenu("project")}
                  onCancel={cancelHover}
                  onOpenNow={() => {
                    cancelHover();
                    showSubmenu("project");
                  }}
                />
                <MenuSeparator />
                <MenuRow
                  icon={<Pencil />}
                  label="Edit"
                  onOpen={hideSubmenu}
                  onClick={() => {
                    setMenu(null);
                    openEdit(issue._id);
                  }}
                />
                <MenuRow icon={<Copy />} label="Copy link" onOpen={hideSubmenu} onClick={() => void copyLink()} />
                <MenuRow
                  label={`Open ${issue.identifier}`}
                  onOpen={hideSubmenu}
                  onClick={() => {
                    setMenu(null);
                    router.push(`/issues/${issue._id}`);
                  }}
                />
                <MenuSeparator />
                <MenuRow
                  icon={<Trash2 />}
                  label="Delete"
                  shortcut="Ctrl Delete"
                  onOpen={hideSubmenu}
                  onClick={() => void onDelete()}
                />
              </div>
              {menu.submenu ? (
                <div
                  ref={subRef}
                  role="menu"
                  className={cn(
                    "fixed z-50 max-h-[min(70dvh,420px)] overflow-y-auto rounded-lg bg-popover p-1 text-[13px] text-popover-foreground shadow-lg ring-1 ring-foreground/10",
                    menu.submenu === "due" ? "w-72" : "w-60",
                  )}
                  style={{ left: initialLeft + MENU_WIDTH + 4, top: initialTop, opacity: 0 }}
                  onMouseEnter={cancelHover}
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  {menu.submenu === "status"
                    ? ISSUE_STATUSES.map((status) => (
                        <ChoiceRow
                          key={status}
                          icon={<StatusIcon status={status} />}
                          label={statusLabel(status)}
                          active={status === issue.status}
                          onClick={() => void patch({ status })}
                        />
                      ))
                    : null}
                  {menu.submenu === "priority"
                    ? PRIORITIES.map((priority) => (
                        <ChoiceRow
                          key={priority}
                          icon={<PriorityIcon priority={priority} />}
                          label={priorityLabel(priority)}
                          active={priority === issue.priority}
                          onClick={() => void patch({ priority })}
                        />
                      ))
                    : null}
                  {menu.submenu === "assignee" ? (
                    <>
                      <ChoiceRow
                        icon={<User />}
                        label="No assignee"
                        active={!issue.assignee}
                        onClick={() => void patch({ assigneeId: null })}
                      />
                      {members === undefined ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>
                      ) : (
                        members.map((member) => (
                          <ChoiceRow
                            key={member._id}
                            icon={<UserAvatar user={member} className="size-4" />}
                            label={member.name || member.email || "Member"}
                            hint={member._id === me?._id ? "you" : undefined}
                            active={issue.assignee?._id === member._id}
                            onClick={() => void patch({ assigneeId: member._id })}
                          />
                        ))
                      )}
                    </>
                  ) : null}
                  {menu.submenu === "due" ? (
                    <>
                      <input
                        ref={dueInputRef}
                        placeholder="Try: 24h, 7 days, Feb 9"
                        aria-label="Due date"
                        className="mb-1 h-8 w-full rounded-md bg-transparent px-2 text-[13px] outline-none placeholder:text-muted-foreground"
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          applyDueText(event.currentTarget.value);
                        }}
                      />
                      {dueError ? <p className="px-2 pb-1 text-[11px] text-destructive">{dueError}</p> : null}
                      {issue.dueDate ? (
                        <MenuRow
                          icon={<CalendarX2 />}
                          label="Remove due date"
                          shortcut={formatMenuDate(issue.dueDate)}
                          onClick={() => applyDue(null)}
                        />
                      ) : null}
                      <MenuRow
                        icon={<OptionMark active={false} />}
                        label="Custom..."
                        onClick={() => {
                          setCustomOpen(true);
                          const input = customDateRef.current;
                          input?.focus();
                          try {
                            input?.showPicker();
                          } catch {
                            // The inline date field stays in the menu.
                          }
                        }}
                      />
                      <input
                        ref={customDateRef}
                        type="date"
                        defaultValue={dateInputValue(issue.dueDate)}
                        className={cn(
                          "mx-1 mb-1 h-8 w-[calc(100%-0.5rem)] rounded-md border border-border bg-transparent px-2 text-xs",
                          !customOpen && "sr-only",
                        )}
                        onChange={(event) => {
                          const timestamp = dateInputToTimestamp(event.target.value);
                          if (timestamp) applyDue(timestamp);
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                      />
                      <MenuRow
                        icon={<OptionMark active={sameLocalDay(issue.dueDate, tomorrow)} />}
                        label="Tomorrow"
                        shortcut={formatMenuDate(tomorrow)}
                        onClick={() => applyDue(tomorrow)}
                      />
                      <MenuRow
                        icon={<OptionMark active={sameLocalDay(issue.dueDate, endOfWeek)} />}
                        label="End of this week"
                        shortcut={formatMenuDate(endOfWeek)}
                        onClick={() => applyDue(endOfWeek)}
                      />
                      <MenuRow
                        icon={<OptionMark active={sameLocalDay(issue.dueDate, inOneWeek)} />}
                        label="In one week"
                        shortcut={formatMenuDate(inOneWeek)}
                        onClick={() => applyDue(inOneWeek)}
                      />
                    </>
                  ) : null}
                  {menu.submenu === "labels" ? (
                    labels === undefined ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>
                    ) : labels.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No labels</div>
                    ) : (
                      labels.map((label) => (
                        <ChoiceRow
                          key={label._id}
                          icon={<span className="size-2.5 rounded-full" style={{ backgroundColor: label.color }} />}
                          label={label.name}
                          active={selectedLabelIds.includes(label._id)}
                          onClick={() => toggleLabel(label._id)}
                        />
                      ))
                    )
                  ) : null}
                  {menu.submenu === "project" ? (
                    projects === undefined ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>
                    ) : (
                      projects.map((project) => (
                        <ChoiceRow
                          key={project._id}
                          icon={
                            <span
                              className="size-3.5 rounded-[3px]"
                              style={{ backgroundColor: projectColor(project.key) }}
                            />
                          }
                          label={project.name}
                          hint={project.key}
                          active={project._id === issue.projectId}
                          onClick={() => {
                            if (project._id === issue.projectId) {
                              setMenu(null);
                              return;
                            }
                            void patch({ projectId: project._id });
                          }}
                        />
                      ))
                    )
                  ) : null}
                </div>
              ) : null}
            </>,
            document.body,
          )
        : null}
    </div>
  );
}

function MenuSeparator() {
  return <div className="-mx-1 my-1 h-px bg-border" />;
}

function MenuRow({
  icon,
  label,
  shortcut,
  submenu,
  open,
  onOpen,
  onOpenNow,
  onCancel,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  shortcut?: string;
  submenu?: Submenu;
  open?: boolean;
  onOpen?: () => void;
  onOpenNow?: () => void;
  onCancel?: () => void;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-submenu={submenu}
      onMouseEnter={onOpen}
      onMouseLeave={onCancel}
      onClick={onClick ?? onOpenNow ?? onOpen}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none hover:bg-accent hover:text-accent-foreground",
        open && "bg-accent text-accent-foreground",
      )}
    >
      {icon ? (
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&>svg]:size-4">
          {icon}
        </span>
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <span className="truncate">{label}</span>
      {shortcut || submenu ? (
        <span className="ml-auto flex items-center gap-1.5 pl-3 text-[11px] text-muted-foreground">
          {shortcut ? <span className="whitespace-nowrap">{shortcut}</span> : null}
          {submenu ? <ChevronRight className="size-3.5" /> : null}
        </span>
      ) : null}
    </button>
  );
}

function ChoiceRow({
  icon,
  label,
  hint,
  active,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none hover:bg-accent hover:text-accent-foreground",
        active && "bg-accent/60",
      )}
    >
      {icon ? <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">{icon}</span> : null}
      <span className="truncate">{label}</span>
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      {active ? <Check className="ml-auto size-3.5 text-muted-foreground" /> : null}
    </button>
  );
}

function OptionMark({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "flex size-3.5 items-center justify-center rounded-[3px] border",
        active ? "border-foreground bg-foreground text-background" : "border-muted-foreground/50",
      )}
    >
      {active ? <Check className="size-2.5" strokeWidth={3} /> : null}
    </span>
  );
}
