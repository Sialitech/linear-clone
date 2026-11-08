import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { ReadCtx } from "./access";
import { subscribesTo, type WebhookEvent } from "./webhookEvents";
import { WEBHOOK_DELIVERY_LIMIT, webhookBody } from "./webhookPayload";

type DeliveryAction = "create" | "update" | "remove";

export type WebhookNotice = {
  event: WebhookEvent;
  action: DeliveryAction;
  data: object;
  updatedFrom?: object;
  related?: { id: string; identifier: string };
};

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

export async function emitWebhookEvents(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    notifications: WebhookNotice[];
  },
) {
  if (args.notifications.length === 0) return;
  const hooks = await ctx.db
    .query("webhooks")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
    .take(10);
  const enabled = hooks.filter((hook) => hook.enabled);
  if (enabled.length === 0) return;
  const createdAt = new Date().toISOString();
  for (const notice of args.notifications) {
    const targets = enabled.filter((hook) => subscribesTo(hook.resources, notice.event));
    if (targets.length === 0) continue;
    const body = webhookBody({
      action: notice.action,
      type: notice.event,
      createdAt,
      data: notice.data,
      updatedFrom: definedFields(notice.updatedFrom),
      related: notice.related,
    });
    for (const hook of targets) {
      await enqueueDelivery(ctx, hook, notice.event, notice.action, body);
    }
  }
}

export async function enqueueDelivery(
  ctx: MutationCtx,
  webhook: Doc<"webhooks">,
  event: string,
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
