"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { statusLabel } from "@/components/status-icon";
import type { IssueStatus } from "@convex/model";
import { useRef } from "react";

export default function SubIssueStatusDialog({
  open,
  status,
  count,
  onOnlyThis,
  onAll,
  onDismiss,
}: {
  open: boolean;
  status: IssueStatus | null;
  count: number;
  onOnlyThis: () => void;
  onAll: () => void;
  onDismiss: () => void;
}) {
  const label = status ? statusLabel(status) : "";
  const acted = useRef(false);
  function choose(action: () => void) {
    acted.current = true;
    action();
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        if (acted.current) {
          acted.current = false;
          return;
        }
        onDismiss();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update sub-issues?</DialogTitle>
          <DialogDescription>
            This issue has {count} sub-issue{count === 1 ? "" : "s"}. Change them to {label} too?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => choose(onOnlyThis)}>
            This issue only
          </Button>
          <Button type="button" onClick={() => choose(onAll)}>
            All sub-issues
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
