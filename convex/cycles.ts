import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { z } from "zod";
import { requireWorkspaceMember, type ReadCtx } from "./lib/access";
import {
  cycleIdSchema,
  cycleStatusSchema,
  workspaceIdSchema,
  zMutation,
  zQuery,
} from "./lib/functions";

async function listWorkspaceCycles(ctx: ReadCtx, workspaceId: Id<"workspaces">) {
  return await ctx.db
    .query("cycles")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .take(200);
}

async function nextCycleNumber(ctx: ReadCtx, workspaceId: Id<"workspaces">) {
  const cycles = await listWorkspaceCycles(ctx, workspaceId);
  let max = 0;
  for (const cycle of cycles) {
    if (cycle.number > max) max = cycle.number;
  }
  return max + 1;
}

async function findActiveCycle(ctx: ReadCtx, workspaceId: Id<"workspaces">) {
  return await ctx.db
    .query("cycles")
    .withIndex("by_workspace_and_status", (q) =>
      q.eq("workspaceId", workspaceId).eq("status", "active"),
    )
    .unique();
}

async function findUpcomingCycles(ctx: ReadCtx, workspaceId: Id<"workspaces">) {
  const cycles = await ctx.db
    .query("cycles")
    .withIndex("by_workspace_and_status", (q) =>
      q.eq("workspaceId", workspaceId).eq("status", "upcoming"),
    )
    .take(100);
  return cycles.sort((a, b) => a.number - b.number);
}

async function completeActiveCycle(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  exceptId?: Id<"cycles">,
) {
  const active = await findActiveCycle(ctx, workspaceId);
  if (active && active._id !== exceptId) {
    await ctx.db.patch("cycles", active._id, { status: "completed" });
  }
}

function assertValidRange(startsAt: number, endsAt: number) {
  if (!(Number.isFinite(startsAt) && Number.isFinite(endsAt))) {
    throw new Error("Enter valid start and end dates");
  }
  if (endsAt < startsAt) {
    throw new Error("End date must be on or after the start date");
  }
}

export async function assertAssignableCycle(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
  cycleId: Id<"cycles"> | null | undefined,
  options?: { allowCompletedIfCurrent?: Id<"cycles"> | undefined },
) {
  if (!cycleId) return;
  const cycle = await ctx.db.get("cycles", cycleId);
  if (!cycle || cycle.workspaceId !== workspaceId) {
    throw new Error("Cycle is not in this workspace");
  }
  if (cycle.status === "completed") {
    if (options?.allowCompletedIfCurrent && options.allowCompletedIfCurrent === cycleId) {
      return cycle;
    }
    throw new Error("Cannot assign issues to a completed cycle");
  }
  return cycle;
}

export const list = zQuery({
  args: {
    workspaceId: workspaceIdSchema,
    status: cycleStatusSchema.optional(),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);
    const cycles = args.status
      ? await ctx.db
          .query("cycles")
          .withIndex("by_workspace_and_status", (q) =>
            q.eq("workspaceId", args.workspaceId).eq("status", args.status!),
          )
          .take(200)
      : await listWorkspaceCycles(ctx, args.workspaceId);

    const withCounts = [];
    for (const cycle of cycles) {
      const issues = await ctx.db
        .query("issues")
        .withIndex("by_cycle", (q) => q.eq("cycleId", cycle._id))
        .take(500);
      withCounts.push({
        ...cycle,
        issueCount: issues.length,
      });
    }

    return withCounts.sort((a, b) => {
      const rank = { active: 0, upcoming: 1, completed: 2 } as const;
      const byStatus = rank[a.status] - rank[b.status];
      if (byStatus !== 0) return byStatus;
      if (a.status === "completed") return b.number - a.number;
      return a.number - b.number;
    });
  },
});

export const get = zQuery({
  args: { cycleId: cycleIdSchema },
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get("cycles", args.cycleId);
    if (!cycle) return null;
    await requireWorkspaceMember(ctx, cycle.workspaceId);
    return cycle;
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
    assertValidRange(args.startsAt, args.endsAt);
    const number = await nextCycleNumber(ctx, args.workspaceId);
    return await ctx.db.insert("cycles", {
      workspaceId: args.workspaceId,
      number,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      status: "upcoming",
      createdAt: Date.now(),
    });
  },
});

export const activate = zMutation({
  args: { cycleId: cycleIdSchema },
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get("cycles", args.cycleId);
    if (!cycle) throw new Error("Cycle not found");
    await requireWorkspaceMember(ctx, cycle.workspaceId);
    if (cycle.status === "active") return cycle._id;
    if (cycle.status === "completed") {
      throw new Error("Completed cycles cannot be activated");
    }
    await completeActiveCycle(ctx, cycle.workspaceId, cycle._id);
    await ctx.db.patch("cycles", cycle._id, { status: "active" });
    return cycle._id;
  },
});

export const complete = zMutation({
  args: { cycleId: cycleIdSchema },
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get("cycles", args.cycleId);
    if (!cycle) throw new Error("Cycle not found");
    await requireWorkspaceMember(ctx, cycle.workspaceId);
    if (cycle.status === "completed") return cycle._id;
    if (cycle.status !== "active") {
      throw new Error("Only the active cycle can be completed");
    }
    await ctx.db.patch("cycles", cycle._id, { status: "completed" });
    return cycle._id;
  },
});

export const moveUnfinishedToNext = zMutation({
  args: {
    workspaceId: workspaceIdSchema,
    startsAt: z.number().finite().optional(),
    endsAt: z.number().finite().optional(),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);
    const active = await findActiveCycle(ctx, args.workspaceId);
    if (!active) {
      throw new Error("No active cycle to roll over");
    }

    let next: Doc<"cycles"> | null = (await findUpcomingCycles(ctx, args.workspaceId))[0] ?? null;
    if (!next) {
      if (args.startsAt === undefined || args.endsAt === undefined) {
        throw new Error("Provide start and end dates for the next cycle");
      }
      assertValidRange(args.startsAt, args.endsAt);
      const number = await nextCycleNumber(ctx, args.workspaceId);
      const nextId = await ctx.db.insert("cycles", {
        workspaceId: args.workspaceId,
        number,
        startsAt: args.startsAt,
        endsAt: args.endsAt,
        status: "upcoming",
        createdAt: Date.now(),
      });
      next = await ctx.db.get("cycles", nextId);
      if (!next) throw new Error("Failed to create the next cycle");
    }

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_cycle", (q) => q.eq("cycleId", active._id))
      .take(500);
    const now = Date.now();
    for (const issue of issues) {
      if (issue.status === "done") continue;
      await ctx.db.patch("issues", issue._id, {
        cycleId: next._id,
        updatedAt: now,
      });
    }

    await ctx.db.patch("cycles", active._id, { status: "completed" });
    await ctx.db.patch("cycles", next._id, { status: "active" });
    return { completedCycleId: active._id, activeCycleId: next._id };
  },
});
