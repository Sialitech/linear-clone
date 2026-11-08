import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { ReadCtx } from "./access";
import { WEBHOOK_DELIVERY_LIMIT, webhookBody } from "./webhookPayload";

type DeliveryAction = "create" | "update" | "remove";

export async function issueWebhookData(ctx: ReadCtx, issue: Doc<"issues">) {
  const project = await ctx.db.get("projects", issue.projectId);
  return {
    id: issue._id,
    identifier: `${project?.key ?? "ISS"}-${issue.number}`,
    title: issue.title,
    description: issue.description,
    status: issue.status,
    priority: issue.priority,
    assigneeId: issue.assigneeId ?? null,
    projectId: issue.projectId,
    labelIds: [...issue.labelIds].map(String).sort(),
    dueDate: issue.dueDate ?? null,
    cycleId: issue.cycleId ?? null,
    parentId: issue.parentId ?? null,
    creatorId: issue.creatorId,
    snoozedUntil: issue.snoozedUntil ?? null,
  };
}

export function commentWebhookData(comment: {
  _id: Id<"comments">;
  issueId: Id<"issues">;
  authorId: Id<"users">;
  content: string;
  mentionIds?: Id<"users">[];
}) {
  return {
    id: comment._id,
    issueId: comment.issueId,
    authorId: comment.authorId,
    content: comment.content,
    mentionIds: (comment.mentionIds ?? []).map(String),
  };
}

export async function emitWebhook(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    event: "Issue" | "Comment";
    action: DeliveryAction;
    data: object;
    updatedFrom?: object;
  },
) {
  const hooks = await ctx.db
    .query("webhooks")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
    .take(10);
  const targets = hooks.filter((hook) => hook.enabled && hook.resources.includes(args.event));
  if (targets.length === 0) return;
  const body = webhookBody({
    action: args.action,
    type: args.event,
    createdAt: new Date().toISOString(),
    data: args.data,
    updatedFrom: definedFields(args.updatedFrom),
  });
  for (const hook of targets) {
    await enqueueDelivery(ctx, hook, args.event, args.action, body);
  }
}

export async function enqueueDelivery(
  ctx: MutationCtx,
  webhook: Doc<"webhooks">,
  event: "Issue" | "Comment" | "Ping",
  action: DeliveryAction,
  body: string,
) {
  const deliveryId = await ctx.db.insert("webhookDeliveries", {
    webhookId: webhook._id,
    workspaceId: webhook.workspaceId,
    event,
    action,
    body,
    status: "pending",
    attempts: 0,
    createdAt: Date.now(),
  });
  const oldest = await ctx.db
    .query("webhookDeliveries")
    .withIndex("by_webhook", (q) => q.eq("webhookId", webhook._id))
    .order("asc")
    .take(WEBHOOK_DELIVERY_LIMIT + 30);
  const extra = oldest.length - WEBHOOK_DELIVERY_LIMIT;
  if (extra > 0) {
    for (const row of oldest.slice(0, extra)) {
      await ctx.db.delete("webhookDeliveries", row._id);
    }
  }
  await ctx.scheduler.runAfter(0, internal.webhooks.deliver, { deliveryId });
  return deliveryId;
}

function definedFields(fields: object | undefined) {
  if (!fields) return undefined;
  const entries = Object.entries(fields).filter((entry) => entry[1] !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
