"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { CYCLE_STATUS_LABELS } from "@convex/model";
import IssueList from "@/components/issue-list";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { dateInputToTimestamp, dateInputValue, errorMessage, formatDue } from "@/lib/format";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export default function CyclesScreen() {
  const { workspace } = useWorkspace();
  const cycles = useQuery(api.cycles.list, workspace ? { workspaceId: workspace._id } : "skip");
  const create = useMutation(api.cycles.create);
  const activate = useMutation(api.cycles.activate);
  const complete = useMutation(api.cycles.complete);
  const moveUnfinished = useMutation(api.cycles.moveUnfinishedToNext);
  const [creating, setCreating] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [pending, setPending] = useState(false);

  const nextNumber = useMemo(() => {
    if (!cycles?.length) return 1;
    return Math.max(...cycles.map((cycle) => cycle.number)) + 1;
  }, [cycles]);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!workspace) return;
    const start = dateInputToTimestamp(startsAt);
    const end = dateInputToTimestamp(endsAt);
    if (start === null || end === null) {
      toast.error("Choose start and end dates");
      return;
    }
    setPending(true);
    try {
      await create({ workspaceId: workspace._id, startsAt: start, endsAt: end });
      setCreating(false);
      setStartsAt("");
      setEndsAt("");
      toast.success(`Cycle ${nextNumber} created`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function onActivate(cycleId: Id<"cycles">) {
    try {
      await activate({ cycleId });
      toast.success("Cycle activated");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onComplete(cycleId: Id<"cycles">) {
    try {
      await complete({ cycleId });
      toast.success("Cycle completed");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onMoveUnfinished(cycleId: Id<"cycles">) {
    try {
      await moveUnfinished({ cycleId });
      toast.success("Unfinished issues moved to the next cycle");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-12 items-center gap-2 border-b border-border px-3 sm:px-4">
        <h1 className="text-sm font-medium">Cycles</h1>
        <Button
          type="button"
          size="sm"
          className="ml-auto h-9 sm:h-7"
          onClick={() => {
            const today = dateInputValue(Date.now());
            setStartsAt(today);
            setEndsAt(today);
            setCreating(true);
          }}
        >
          New cycle
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)]">
        {cycles === undefined ? (
          <div className="px-4 py-8 text-sm text-muted-foreground">Loading cycles…</div>
        ) : cycles.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-muted-foreground">
            No cycles yet. Create Cycle 1 to start a cadence.
          </div>
        ) : (
          cycles.map((cycle) => (
            <CycleSection
              key={cycle._id}
              cycle={cycle}
              workspaceId={workspace!._id}
              onActivate={() => void onActivate(cycle._id)}
              onComplete={() => void onComplete(cycle._id)}
              onMoveUnfinished={() => void onMoveUnfinished(cycle._id)}
            />
          ))
        )}
      </div>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Cycle {nextNumber}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Start
              </label>
              <Input
                type="date"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                End
              </label>
              <Input
                type="date"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Create Cycle {nextNumber}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CycleSection({
  cycle,
  workspaceId,
  onActivate,
  onComplete,
  onMoveUnfinished,
}: {
  cycle: {
    _id: Id<"cycles">;
    number: number;
    status: "upcoming" | "active" | "completed";
    startsAt: number;
    endsAt: number;
    issueCount: number;
  };
  workspaceId: Id<"workspaces">;
  onActivate: () => void;
  onComplete: () => void;
  onMoveUnfinished: () => void;
}) {
  const issues = useQuery(api.issues.list, {
    workspaceId,
    cycleId: cycle._id,
  });

  return (
    <section className="border-b border-border">
      <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium">Cycle {cycle.number}</h2>
            <span className="text-[11px] text-muted-foreground">
              {CYCLE_STATUS_LABELS[cycle.status]}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDue(cycle.startsAt)} – {formatDue(cycle.endsAt)} · {cycle.issueCount}{" "}
            {cycle.issueCount === 1 ? "issue" : "issues"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {cycle.status === "upcoming" ? (
            <Button type="button" size="sm" variant="outline" className="h-9 sm:h-7" onClick={onActivate}>
              Mark active
            </Button>
          ) : null}
          {cycle.status === "active" ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 sm:h-7"
                onClick={onMoveUnfinished}
              >
                Move unfinished to next cycle
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-9 sm:h-7" onClick={onComplete}>
                Mark completed
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <IssueList issues={issues} empty="No issues in this cycle." />
    </section>
  );
}
