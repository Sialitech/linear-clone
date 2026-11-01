"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ISSUE_STATUSES, type IssueStatus } from "@convex/model";
import StatusIcon, { statusLabel } from "@/components/status-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMutation } from "convex/react";
import { Check } from "lucide-react";
import { useEffect, useState, type MouseEvent, type PointerEvent } from "react";
import { toast } from "sonner";

export default function StatusPicker({
  issueId,
  status,
  className,
}: {
  issueId: Id<"issues">;
  status: IssueStatus;
  className?: string;
}) {
  const update = useMutation(api.issues.update);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = Number(event.key) - 1;
      const next = ISSUE_STATUSES[index];
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      void apply(next);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, issueId, status]);

  async function apply(next: IssueStatus) {
    setOpen(false);
    if (next === status) return;
    try {
      await update({ issueId, status: next });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function keepInRow(event: MouseEvent | PointerEvent) {
    event.stopPropagation();
  }

  return (
    <span
      className="inline-flex"
      onPointerDown={keepInRow}
      onMouseDown={keepInRow}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Change status, current ${statusLabel(status)}`}
            aria-haspopup="menu"
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-foreground hover:bg-white/10",
              className,
            )}
            onDragStart={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          />
        }
      >
        <StatusIcon status={status} className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-60 p-1"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-2 py-1.5 text-[13px] text-muted-foreground">
          <span>Change status...</span>
          <span className="text-xs">S</span>
        </div>
        {ISSUE_STATUSES.map((item, index) => {
          const active = item === status;
          return (
            <DropdownMenuItem
              key={item}
              className="gap-2 px-2 py-1.5 text-[13px]"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void apply(item);
              }}
            >
              <StatusIcon status={item} className="size-3.5" />
              <span className="flex-1 truncate">{statusLabel(item)}</span>
              {active ? <Check className="size-3.5 text-muted-foreground" /> : <span className="size-3.5" />}
              <span className="w-3 text-right text-xs text-muted-foreground">{index + 1}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
    </span>
  );
}
