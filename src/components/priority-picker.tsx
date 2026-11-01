"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PRIORITIES, type Priority } from "@convex/model";
import PriorityIcon, { priorityLabel } from "@/components/priority-icon";
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
import { useCallback, useEffect, useState, type MouseEvent, type PointerEvent } from "react";
import { toast } from "sonner";

export default function PriorityPicker({
  issueId,
  priority,
  className,
}: {
  issueId: Id<"issues">;
  priority: Priority;
  className?: string;
}) {
  const update = useMutation(api.issues.update);
  const [open, setOpen] = useState(false);

  const apply = useCallback(
    async (next: Priority) => {
      setOpen(false);
      if (next === priority) return;
      try {
        await update({ issueId, priority: next });
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },
    [issueId, priority, update],
  );

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = Number(event.key) - 1;
      const next = PRIORITIES[index];
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      void apply(next);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, apply]);

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
              aria-label={`Change priority, current ${priorityLabel(priority)}`}
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
          <PriorityIcon priority={priority} className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-60 p-1"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between px-2 py-1.5 text-[13px] text-muted-foreground">
            <span>Change priority...</span>
            <span className="text-xs">P</span>
          </div>
          {PRIORITIES.map((item, index) => {
            const active = item === priority;
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
                <PriorityIcon priority={item} className="size-3.5" />
                <span className="flex-1 truncate">{priorityLabel(item)}</span>
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
