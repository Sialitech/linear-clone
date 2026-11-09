import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const STORAGE_IMAGE = /!\[[^\]]*\]\((?:storage:|https?:\/\/[^)\s]*\/api\/storage\/)([a-z0-9]+)\)/gi;

export function storageIdsIn(text: string): Id<"_storage">[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(STORAGE_IMAGE)) {
    const id = match[1];
    if (id) ids.add(id);
  }
  return [...ids] as Id<"_storage">[];
}

export async function linkAttachments(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    text: string;
    issueId: Id<"issues">;
    commentId?: Id<"comments">;
  },
) {
  const keep = new Set(storageIdsIn(args.text));
  const existing = args.commentId
    ? await ctx.db
        .query("attachments")
        .withIndex("by_comment", (q) => q.eq("commentId", args.commentId))
        .take(40)
    : await ctx.db
        .query("attachments")
        .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
        .take(40);

  for (const row of existing) {
    if (args.commentId) {
      if (!keep.has(row.storageId)) {
        await ctx.storage.delete(row.storageId);
        await ctx.db.delete("attachments", row._id);
      }
      continue;
    }
    if (row.commentId) continue;
    if (!keep.has(row.storageId)) {
      await ctx.storage.delete(row.storageId);
      await ctx.db.delete("attachments", row._id);
    }
  }

  for (const storageId of keep) {
    const row = await ctx.db
      .query("attachments")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .unique();
    if (!row || row.workspaceId !== args.workspaceId) continue;
    if (row.issueId === args.issueId && row.commentId === args.commentId) continue;
    await ctx.db.patch("attachments", row._id, {
      issueId: args.issueId,
      ...(args.commentId ? { commentId: args.commentId } : {}),
    });
  }
}
