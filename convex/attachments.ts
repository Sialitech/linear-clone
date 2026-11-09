import type { Id } from "./_generated/dataModel";
import { z } from "zod";
import { requireWorkspaceMember } from "./lib/access";
import { zMutation, workspaceIdSchema } from "./lib/functions";

const storageIdSchema = z.string().regex(/^[a-z0-9]+$/);

export const generateUploadUrl = zMutation({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);
    return ctx.storage.generateUploadUrl();
  },
});

export const register = zMutation({
  args: {
    workspaceId: workspaceIdSchema,
    storageId: storageIdSchema,
    fileName: z.string().trim().min(1).max(200),
    contentType: z.string().trim().min(1).max(100),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
    if (!args.contentType.startsWith("image/")) {
      throw new Error("Only images can be attached");
    }
    const storageId = args.storageId as Id<"_storage">;
    const meta = await ctx.storage.getMetadata(storageId).catch(() => null);
    if (!meta) throw new Error("Upload was not stored");
    if (meta.contentType && !meta.contentType.startsWith("image/")) {
      await ctx.storage.delete(storageId);
      throw new Error("Only images can be attached");
    }
    const existing = await ctx.db
      .query("attachments")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .unique();
    if (!existing) {
      await ctx.db.insert("attachments", {
        storageId,
        workspaceId: args.workspaceId,
        uploadedBy: userId,
        fileName: args.fileName,
        contentType: args.contentType,
        createdAt: Date.now(),
      });
    }
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Image upload failed");
    return url;
  },
});
