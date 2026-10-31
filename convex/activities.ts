import { z } from "zod";
import { loadPublicUser, requireIssueAccess } from "./lib/access";
import { issueIdSchema, zQuery } from "./lib/functions";

export const list = zQuery({
  args: { issueId: issueIdSchema },
  handler: async (ctx, args) => {
    await requireIssueAccess(ctx, args.issueId);
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .take(200);
    const ordered = [...activities].sort((a, b) => a.createdAt - b.createdAt);
    const result = [];
    for (const activity of ordered) {
      result.push({
        _id: activity._id,
        issueId: activity.issueId,
        type: activity.type,
        fromLabel: activity.fromLabel ?? null,
        toLabel: activity.toLabel ?? null,
        createdAt: activity.createdAt,
        actor: await loadPublicUser(ctx, activity.actorId),
      });
    }
    return result;
  },
});
