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
import { addDays, differenceInCalendarDays } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export default function CyclesScreen() {
  const { workspace } = useWorkspace();
  const cycles = useQuery(api.cycles.list, workspace ? { workspaceId: workspace._id } : "skip");
  const create = useMutation(api.cycles.create);
  const activate = useMutation(api.cycles.activate);
  const complete = useMutation(api.cycles.complete);
  const rollover = useMutation(api.cycles.moveUnfinishedToNext);
  const [creating, setCreating] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [pending, setPending] = useState(false);

  const active = useMemo(
    () => cycles?.find((cycle) => cycle.status === "active"),
    [cycles],
  );
  const upcoming = useMemo(
    () => cycles?.filter((cycle) => cycle.status === "upcoming") ?? [],
    [cycles],
  );
  const completed = useMemo(
    () => cycles?.filter((cycle) => cycle.status === "completed") ?? [],
    [cycles],
  );
  const nextNumber = useMemo(() => {
    if (!cycles?.length) return 1;
    return Math.max(...cycles.map((cycle) => cycle.number)) + 1;
  }, [cycles]);

  const defaultCreateDates = useMemo(
    () => defaultNextRange(active ?? upcoming[0] ?? completed[0]),
    [active, upcoming, completed],
  );

  async function onCreate(startsAt: string, endsAt: string) {
    if (!workspace) return;
    const start = dateInputToTimestamp(startsAt);
    const end = endDateInputToTimestamp(endsAt);
    if (start === null || end === null) {
      toast.error("Enter start and end dates");
      return;
    }
    setPending(true);
    try {
      await create({ workspaceId: workspace._id, startsAt: start, endsAt: end });
      setCreating(false);
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

  async function onRollover(startsAt?: string, endsAt?: string) {
    if (!workspace) return;
    setPending(true);
    try {
      const args: {
        workspaceId: Id<"workspaces">;
        startsAt?: number;
        endsAt?: number;
      } = { workspaceId: workspace._id };
      if (upcoming.length === 0) {
        const start = dateInputToTimestamp(startsAt ?? "");
        const end = endDateInputToTimestamp(endsAt ?? "");
        if (start === null || end === null) {
          toast.error("Enter start and end dates for the next cycle");
          setPending(false);
          return;
        }
        args.startsAt = start;
        args.endsAt = end;
      }
      await rollover(args);
      setRolling(false);
      toast.success("Moved unfinished issues to the next cycle");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-12 items-center gap-2 border-b border-border px-3 sm:px-4">
        <h1 className="text-sm font-medium">Cycles</h1>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto h-9 sm:h-7"
          onClick={() => setCreating(true)}
        >
          Create Cycle {nextNumber}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)]">
        {cycles === undefined ? (
          <div className="space-y-3 p-3 sm:p-4" aria-busy="true" aria-label="Loading cycles">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="rounded-lg border border-border px-4 py-3">
                <div className="h-3.5 w-32 animate-pulse rounded-md bg-white/8" />
                <div className="mt-3 h-3 w-48 animate-pulse rounded-md bg-white/8" />
              </div>
            ))}
          </div>
        ) : cycles.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-muted-foreground">
            No cycles yet. Create Cycle 1 to start a cadence for this workspace.
          </div>
        ) : (
          <div className="space-y-8 p-3 sm:p-4">
            {active ? (
              <CycleSection
                cycle={active}
                workspaceId={workspace?._id}
                actions={
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 sm:h-7"
                      onClick={() => {
                        if (upcoming.length === 0) setRolling(true);
                        else void onRollover();
                      }}
                    >
                      Move unfinished to next cycle
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-9 sm:h-7"
                      onClick={() => void onComplete(active._id)}
                    >
                      Mark completed
                    </Button>
                  </>
                }
              />
            ) : (
              <section className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                No active cycle. Activate an upcoming cycle to start work.
              </section>
            )}

            {upcoming.length > 0 ? (
              <div className="space-y-4">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Upcoming
                </h2>
                {upcoming.map((cycle) => (
                  <CycleSection
                    key={cycle._id}
                    cycle={cycle}
                    workspaceId={workspace?._id}
                    compact
                    actions={
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 sm:h-7"
                        onClick={() => void onActivate(cycle._id)}
                      >
                        Mark active
                      </Button>
                    }
                  />
                ))}
              </div>
            ) : null}

            {completed.length > 0 ? (
              <details className="space-y-4" open={!active && upcoming.length === 0}>
                <summary className="cursor-pointer text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Completed ({completed.length})
                </summary>
                <div className="mt-3 space-y-4">
                  {completed.map((cycle) => (
                    <CycleSection
                      key={cycle._id}
                      cycle={cycle}
                      workspaceId={workspace?._id}
                      compact
                    />
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        )}
      </div>

      <CycleDatesDialog
        open={creating}
        onOpenChange={setCreating}
        title={`Create Cycle ${nextNumber}`}
        submitLabel="Create cycle"
        pending={pending}
        defaultStartsAt={defaultCreateDates.startsAt}
        defaultEndsAt={defaultCreateDates.endsAt}
        onSubmit={onCreate}
      />
      <CycleDatesDialog
        open={rolling}
        onOpenChange={setRolling}
        title="Move unfinished to next cycle"
        submitLabel="Move and activate"
        pending={pending}
        defaultStartsAt={defaultCreateDates.startsAt}
        defaultEndsAt={defaultCreateDates.endsAt}
        onSubmit={(startsAt, endsAt) => onRollover(startsAt, endsAt)}
      />
    </div>
  );
}

function CycleSection({
  cycle,
  workspaceId,
  actions,
  compact,
}: {
  cycle: {
    _id: Id<"cycles">;
    number: number;
    status: "upcoming" | "active" | "completed";
    startsAt: number;
    endsAt: number;
    issueCount: number;
  };
  workspaceId?: Id<"workspaces">;
  actions?: React.ReactNode;
  compact?: boolean;
}) {
  const issues = useQuery(
    api.issues.list,
    workspaceId ? { workspaceId, cycleId: cycle._id } : "skip",
  );

  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-col gap-2 border-b border-border px-3 py-3 sm:flex-row sm:items-center sm:px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Cycle {cycle.number}</h3>
            <span className="text-[11px] text-muted-foreground">
              {CYCLE_STATUS_LABELS[cycle.status]}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDue(cycle.startsAt)} – {formatDue(cycle.endsAt)} · {cycle.issueCount}{" "}
            {cycle.issueCount === 1 ? "issue" : "issues"}
          </p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2 sm:ml-auto">{actions}</div> : null}
      </div>
      {!compact || cycle.issueCount > 0 ? (
        <IssueList issues={issues} empty="No issues in this cycle." />
      ) : null}
    </section>
  );
}

function CycleDatesDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  pending,
  defaultStartsAt,
  defaultEndsAt,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  pending: boolean;
  defaultStartsAt: string;
  defaultEndsAt: string;
  onSubmit: (startsAt: string, endsAt: string) => void | Promise<void>;
}) {
  const [startsAt, setStartsAt] = useState(defaultStartsAt);
  const [endsAt, setEndsAt] = useState(defaultEndsAt);

  useEffect(() => {
    if (!open) return;
    setStartsAt(defaultStartsAt);
    setEndsAt(defaultEndsAt);
  }, [open, defaultStartsAt, defaultEndsAt]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit(startsAt, endsAt);
          }}
        >
          <label className="block space-y-1 text-xs text-muted-foreground">
            Start date
            <Input
              type="date"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              className="h-9 text-base sm:h-8 sm:text-sm"
            />
          </label>
          <label className="block space-y-1 text-xs text-muted-foreground">
            End date
            <Input
              type="date"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
              className="h-9 text-base sm:h-8 sm:text-sm"
            />
          </label>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function endDateInputToTimestamp(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

function defaultNextRange(
  previous:
    | {
        startsAt: number;
        endsAt: number;
      }
    | undefined,
) {
  if (!previous) {
    const start = new Date();
    const end = addDays(start, 13);
    return {
      startsAt: dateInputValue(start.getTime()),
      endsAt: dateInputValue(end.getTime()),
    };
  }
  const length = Math.max(
    1,
    differenceInCalendarDays(previous.endsAt, previous.startsAt) + 1,
  );
  const start = addDays(new Date(previous.endsAt), 1);
  const end = addDays(start, length - 1);
  return {
    startsAt: dateInputValue(start.getTime()),
    endsAt: dateInputValue(end.getTime()),
  };
}
