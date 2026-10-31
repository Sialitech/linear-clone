import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { z } from "zod";
import { requireWorkspaceMember, type ReadCtx } from "./lib/access";
import {
  cycleIdSchema,
  workspaceIdSchema,
  zMutation,
  zQuery,
} from "./lib/functions";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Clients send start-of-day timestamps (same helper as due dates). Treat both
// bounds as inclusive calendar days without reinterpreting in server TZ.
function normalizeRange(startsAt: number, endsAt: number) {
  if (endsAt < startsAt) {
    throw new Error("End date must be on or after the start date");
  }
  return { startsAt, endsAt: endsAt + MS_PER_DAY - 1 };
}

async function requireCycleAccess(ctx: ReadCtx, cycleId: Id<"cycles">) {
  const cycle = await ctx.db.get("cycles", cycleId);
  if (!cycle) {
    throw new Error("Cycle not found");
  }
  const access = await requireWorkspaceMember(ctx, cycle.workspaceId);
  return { cycle, ...access };
}

async function nextCycleNumber(ctx: ReadCtx, workspaceId: Id<"workspaces">) {
  const cycles = await ctx.db
    .query("cycles")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .take(500);
  let max = 0;
  for (const cycle of cycles) {
    if (cycle.number > max) max = cycle.number;
  }
  return max + 1;
}

async function activeCycle(ctx: ReadCtx, workspaceId: Id<"workspaces">) {
  return await ctx.db
    .query("cycles")
    .withIndex("by_workspace_and_status", (q) =>
      q.eq("workspaceId", workspaceId).eq("status", "active"),
    )
    .unique();
}

async function upcomingCycles(ctx: ReadCtx, workspaceId: Id<"workspaces">) {
  return await ctx.db
    .query("cycles")
    .withIndex("by_workspace_and_status", (q) =>
      q.eq("workspaceId", workspaceId).eq("status", "upcoming"),
    )
    .take(100);
}

async function issueCount(ctx: QueryCtx, cycleId: Id<"cycles">) {
  const issues = await ctx.db
    .query("issues")
    .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
    .take(500);
  return issues.length;
}

function sortCycles(cycles: Doc<"cycles">[]) {
  const rank = { active: 0, upcoming: 1, completed: 2 } as const;
  return [...cycles].sort((a, b) => {
    const byStatus = rank[a.status] - rank[b.status];
    if (byStatus !== 0) return byStatus;
    if (a.status === "upcoming") return a.startsAt - b.startsAt || a.number - b.number;
    if (a.status === "completed") return b.endsAt - a.endsAt || b.number - a.number;
    return a.number - b.number;
  });
}

async function createUpcomingCycle(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  startsAt: number,
  endsAt: number,
) {
  const range = normalizeRange(startsAt, endsAt);
  const number = await nextCycleNumber(ctx, workspaceId);
  const cycleId = await ctx.db.insert("cycles", {
    workspaceId,
    number,
    startsAt: range.startsAt,
    endsAt: range.endsAt,
    status: "upcoming",
    createdAt: Date.now(),
  });
  return cycleId;
}

export async function assertAssignableCycle(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
  cycleId: Id<"cycles"> | null | undefined,
) {
  if (!cycleId) return;
  const cycle = await ctx.db.get("cycles", cycleId);
  if (!cycle || cycle.workspaceId !== workspaceId) {
    throw new Error("Cycle is not in this workspace");
  }
  if (cycle.status === "completed") {
    throw new Error("Cannot assign issues to a completed cycle");
  }
}

export const list = zQuery({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);
    const cycles = await ctx.db
      .query("cycles")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(200);
    const sorted = sortCycles(cycles);
    const enriched = [];
    for (const cycle of sorted) {
      enriched.push({
        ...cycle,
        issueCount: await issueCount(ctx, cycle._id),
      });
    }
    return enriched;
  },
});

export const listAssignable = zQuery({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);
    const cycles = await ctx.db
      .query("cycles")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(200);
    return sortCycles(
      cycles.filter((cycle) => cycle.status === "active" || cycle.status === "upcoming"),
    );
  },
});

export const create = zMutation({
  args: {
    workspaceId: workspaceIdSchema,
    startsAt: z.number().finite(),
    endsAt: z.number().finite(),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);
    return await createUpcomingCycle(ctx, args.workspaceId, args.startsAt, args.endsAt);
  },
});

export const activate = zMutation({
  args: { cycleId: cycleIdSchema },
  handler: async (ctx, args) => {
    const { cycle } = await requireCycleAccess(ctx, args.cycleId);
    if (cycle.status !== "upcoming") {
      throw new Error("Only upcoming cycles can be activated");
    }
    const current = await activeCycle(ctx, cycle.workspaceId);
    if (current) {
      await ctx.db.patch("cycles", current._id, { status: "completed" });
    }
    await ctx.db.patch("cycles", cycle._id, { status: "active" });
    return cycle._id;
  },
});

export const complete = zMutation({
  args: { cycleId: cycleIdSchema },
  handler: async (ctx, args) => {
    const { cycle } = await requireCycleAccess(ctx, args.cycleId);
    if (cycle.status !== "active") {
      throw new Error("Only the active cycle can be completed");
    }
    await ctx.db.patch("cycles", cycle._id, { status: "completed" });
    return cycle._id;
  },
});

export const moveUnfinishedToNext = zMutation({
  args: { cycleId: cycleIdSchema },
  handler: async (ctx, args) => {
    const { cycle } = await requireCycleAccess(ctx, args.cycleId);
    if (cycle.status !== "active") {
      throw new Error("Only the active cycle can move unfinished issues");
    }

    const upcoming = await upcomingCycles(ctx, cycle.workspaceId);
    upcoming.sort((a, b) => a.startsAt - b.startsAt || a.number - b.number);
    let next: Doc<"cycles">;
    if (upcoming[0]) {
      next = upcoming[0];
    } else {
      const durationMs = Math.max(cycle.endsAt - cycle.startsAt + 1, MS_PER_DAY);
      const nextStart = cycle.endsAt + 1;
      const nextEndDayStart = nextStart + durationMs - MS_PER_DAY;
      const nextId = await createUpcomingCycle(
        ctx,
        cycle.workspaceId,
        nextStart,
        nextEndDayStart,
      );
      const created = await ctx.db.get("cycles", nextId);
      if (!created) throw new Error("Failed to create next cycle");
      next = created;
    }

    for (let pass = 0; pass < 20; pass += 1) {
      const issues = await ctx.db
        .query("issues")
        .withIndex("by_cycle", (q) => q.eq("cycleId", cycle._id))
        .take(100);
      let moved = 0;
      for (const issue of issues) {
        if (issue.status === "done") continue;
        await ctx.db.patch("issues", issue._id, {
          cycleId: next._id,
          updatedAt: Date.now(),
        });
        moved += 1;
      }
      if (moved === 0) break;
    }

    await ctx.db.patch("cycles", cycle._id, { status: "completed" });
    await ctx.db.patch("cycles", next._id, { status: "active" });
    return next._id;
  },
});
