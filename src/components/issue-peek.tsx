"use client";

import IssueDetail from "@/components/issue-detail";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "@/components/workspace-provider";

export default function IssuePeek() {
  const { peekIssueId, closeIssue } = useWorkspace();

  return (
    <Dialog open={peekIssueId !== null} onOpenChange={(open) => { if (!open) closeIssue(); }}>
      <DialogContent
        className="flex h-[min(92dvh,920px)] w-[min(1100px,calc(100%-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        showCloseButton
      >
        <DialogTitle className="sr-only">Issue</DialogTitle>
        <DialogDescription className="sr-only">Issue details</DialogDescription>
        {peekIssueId ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <IssueDetail issueId={peekIssueId} onClose={closeIssue} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
