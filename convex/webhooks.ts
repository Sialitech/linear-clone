import { z } from "zod";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { assertCanManage, requireWorkspaceMember, type ReadCtx } from "./lib/access";
import { webhookIdSchema, workspaceIdSchema, zMutation, zQuery } from "./lib/functions";
import { expandWebhookResources, WEBHOOK_EVENT_IDS } from "./lib/webhookEvents";
import { enqueueDelivery } from "./lib/webhooks";
import {
  WEBHOOK_FAILURES_BEFORE_DISABLE,
  WEBHOOK_LIMIT,
  retryDelayMs,
  webhookBody,
} from "./lib/webhookPayload";
import { createWebhookSecret, signWebhookBody } from "./lib/webhookSign";
import { assertWebhookUrl, webhookUrlError } from "./lib/webhookUrl";

const resourceSchema = z
  .array(z.enum(WEBHOOK_EVENT_IDS))
  .min(1, "Choose at least one event")
  .max(WEBHOOK_EVENT_IDS.length);
const labelSchema = z.string().trim().min(1, "Enter a label").max(60);
const urlSchema = z.string().trim().min(1, "Enter a webhook URL").max(2000);

async function requireManagedWebhook(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
  webhookId: Id<"webhooks">,
) {
  const { membership } = await requireWorkspaceMember(ctx, workspaceId);
  assertCanManage(membership);
  const webhook = await ctx.db.get("webhooks", webhookId);
  if (!webhook || webhook.workspaceId !== workspaceId) throw new Error("Webhook not found");
  return webhook;
}

async function latestDelivery(ctx: ReadCtx, webhookId: Id<"webhooks">) {
  const [delivery] = await ctx.db
    .query("webhookDeliveries")
    .withIndex("by_webhook", (q) => q.eq("webhookId", webhookId))
    .order("desc")
    .take(1);
  return delivery ?? null;
}

function summarizeDelivery(delivery: Doc<"webhookDeliveries"> | null) {
  if (!delivery) return null;
  return {
    _id: delivery._id,
    event: delivery.event,
    action: delivery.action,
    status: delivery.status,
    attempts: delivery.attempts,
    httpStatus: delivery.httpStatus ?? null,
    error: delivery.error ?? null,
    createdAt: delivery.createdAt,
  };
}

function summarizeWebhook(webhook: Doc<"webhooks">, delivery: Doc<"webhookDeliveries"> | null) {
  return {
    _id: webhook._id,
    label: webhook.label,
    url: webhook.url,
    resources: expandWebhookResources(webhook.resources),
    enabled: webhook.enabled,
    createdAt: webhook.createdAt,
    consecutiveFailures: webhook.consecutiveFailures,
    disabledReason: webhook.disabledReason ?? null,
    lastDelivery: summarizeDelivery(delivery),
  };
}

export const list = zQuery({
  args: { workspaceId: workspaceIdSchema },
  handler: async (ctx, args) => {
    const { membership } = await requireWorkspaceMember(ctx, args.workspaceId);
    assertCanManage(membership);
    const hooks = await ctx.db
      .query("webhooks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(WEBHOOK_LIMIT);
    const summarized = [];
    for (const hook of hooks) {
      summarized.push(summarizeWebhook(hook, await latestDelivery(ctx, hook._id)));
    }
    return summarized.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const get = zQuery({
  args: { workspaceId: workspaceIdSchema, webhookId: webhookIdSchema },
  handler: async (ctx, args) => {
    const webhook = await requireManagedWebhook(ctx, args.workspaceId, args.webhookId);
    const delivery = await latestDelivery(ctx, webhook._id);
    return { ...summarizeWebhook(webhook, delivery), secret: webhook.secret };
  },
});

export const deliveries = zQuery({
  args: { workspaceId: workspaceIdSchema, webhookId: webhookIdSchema },
  handler: async (ctx, args) => {
    await requireManagedWebhook(ctx, args.workspaceId, args.webhookId);
    const rows = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_webhook", (q) => q.eq("webhookId", args.webhookId))
      .order("desc")
      .take(20);
    return rows.map((row) => summarizeDelivery(row)!);
  },
});

export const create = zMutation({
  args: {
    workspaceId: workspaceIdSchema,
    label: labelSchema,
    url: urlSchema,
    resources: resourceSchema,
  },
  handler: async (ctx, args) => {
    const { userId, membership } = await requireWorkspaceMember(ctx, args.workspaceId);
    assertCanManage(membership);
    const existing = await ctx.db
      .query("webhooks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(WEBHOOK_LIMIT);
    if (existing.length >= WEBHOOK_LIMIT) {
      throw new Error("You can keep up to 10 webhooks in this workspace");
    }
    const url = assertWebhookUrl(args.url);
    const resources = [...new Set(args.resources)];
    const secret = createWebhookSecret();
    const id = await ctx.db.insert("webhooks", {
      workspaceId: args.workspaceId,
      createdBy: userId,
      label: args.label,
      url,
      secret,
      enabled: true,
      resources,
      createdAt: Date.now(),
      consecutiveFailures: 0,
    });
    return { id, secret };
  },
});

export const update = zMutation({
  args: {
    workspaceId: workspaceIdSchema,
    webhookId: webhookIdSchema,
    label: labelSchema.optional(),
    url: urlSchema.optional(),
    resources: resourceSchema.optional(),
    enabled: z.boolean().optional(),
  },
  handler: async (ctx, args) => {
    const webhook = await requireManagedWebhook(ctx, args.workspaceId, args.webhookId);
    const patch: {
      label?: string;
      url?: string;
      resources?: (typeof WEBHOOK_EVENT_IDS)[number][];
      enabled?: boolean;
      consecutiveFailures?: number;
      disabledReason?: undefined;
    } = {};
    if (args.label !== undefined) patch.label = args.label;
    if (args.url !== undefined) patch.url = assertWebhookUrl(args.url);
    if (args.resources !== undefined) patch.resources = [...new Set(args.resources)];
    if (args.enabled === true) {
      patch.enabled = true;
      patch.consecutiveFailures = 0;
      patch.disabledReason = undefined;
    } else if (args.enabled === false) {
      patch.enabled = false;
      patch.disabledReason = undefined;
    }
    await ctx.db.patch("webhooks", webhook._id, patch);
    return webhook._id;
  },
});

export const rotateSecret = zMutation({
  args: { workspaceId: workspaceIdSchema, webhookId: webhookIdSchema },
  handler: async (ctx, args) => {
    const webhook = await requireManagedWebhook(ctx, args.workspaceId, args.webhookId);
    const secret = createWebhookSecret();
    await ctx.db.patch("webhooks", webhook._id, { secret });
    return { secret };
  },
});

export const remove = zMutation({
  args: { workspaceId: workspaceIdSchema, webhookId: webhookIdSchema },
  handler: async (ctx, args) => {
    const webhook = await requireManagedWebhook(ctx, args.workspaceId, args.webhookId);
    for (let pass = 0; pass < 20; pass += 1) {
      const rows = await ctx.db
        .query("webhookDeliveries")
        .withIndex("by_webhook", (q) => q.eq("webhookId", webhook._id))
        .take(50);
      for (const row of rows) await ctx.db.delete("webhookDeliveries", row._id);
      if (rows.length < 50) break;
    }
    await ctx.db.delete("webhooks", webhook._id);
    return webhook._id;
  },
});

export const sendTest = zMutation({
  args: { workspaceId: workspaceIdSchema, webhookId: webhookIdSchema },
  handler: async (ctx, args) => {
    const webhook = await requireManagedWebhook(ctx, args.workspaceId, args.webhookId);
    if (!webhook.enabled) throw new Error("This webhook is disabled");
    const deliveryId = await enqueueDelivery(
      ctx,
      webhook,
      "Ping",
      "create",
      webhookBody({
        action: "create",
        type: "Ping",
        createdAt: new Date().toISOString(),
        data: { webhookId: webhook._id },
      }),
    );
    return { deliveryId };
  },
});

export const deliveryForSend = internalQuery({
  args: { deliveryId: v.id("webhookDeliveries") },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get("webhookDeliveries", args.deliveryId);
    if (!delivery || delivery.status !== "pending") return null;
    const webhook = await ctx.db.get("webhooks", delivery.webhookId);
    if (!webhook) return null;
    return {
      body: delivery.body,
      event: delivery.event,
      url: webhook.url,
      secret: webhook.secret,
      enabled: webhook.enabled,
    };
  },
});

export const recordDeliveryResult = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    ok: v.boolean(),
    httpStatus: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get("webhookDeliveries", args.deliveryId);
    if (!delivery || delivery.status !== "pending") return;
    const webhook = await ctx.db.get("webhooks", delivery.webhookId);
    const attempts = delivery.attempts + 1;
    const httpPatch = args.httpStatus !== undefined ? { httpStatus: args.httpStatus } : {};
    if (!webhook || !webhook.enabled) {
      await ctx.db.patch("webhookDeliveries", delivery._id, {
        status: "failed",
        attempts,
        error: args.error ?? "Webhook is disabled",
        ...httpPatch,
      });
      return;
    }
    if (args.ok) {
      await ctx.db.patch("webhookDeliveries", delivery._id, {
        status: "succeeded",
        attempts,
        error: undefined,
        ...httpPatch,
      });
      await ctx.db.patch("webhooks", webhook._id, {
        consecutiveFailures: 0,
        disabledReason: undefined,
      });
      return;
    }
    const delay = retryDelayMs(attempts);
    if (delay !== null) {
      await ctx.db.patch("webhookDeliveries", delivery._id, {
        status: "pending",
        attempts,
        ...(args.error !== undefined ? { error: args.error } : {}),
        ...httpPatch,
      });
      await ctx.scheduler.runAfter(delay, internal.webhooks.deliver, {
        deliveryId: delivery._id,
      });
      return;
    }
    const consecutiveFailures = webhook.consecutiveFailures + 1;
    await ctx.db.patch("webhookDeliveries", delivery._id, {
      status: "failed",
      attempts,
      ...(args.error !== undefined ? { error: args.error } : {}),
      ...httpPatch,
    });
    await ctx.db.patch("webhooks", webhook._id, {
      consecutiveFailures,
      ...(consecutiveFailures >= WEBHOOK_FAILURES_BEFORE_DISABLE
        ? {
            enabled: false,
            disabledReason: "Disabled after 10 consecutive failed deliveries",
          }
        : {}),
    });
  },
});

export const deliver = internalAction({
  args: { deliveryId: v.id("webhookDeliveries") },
  handler: async (ctx, args) => {
    const row = await ctx.runQuery(internal.webhooks.deliveryForSend, {
      deliveryId: args.deliveryId,
    });
    if (!row) return;
    if (!row.enabled) {
      await ctx.runMutation(internal.webhooks.recordDeliveryResult, {
        deliveryId: args.deliveryId,
        ok: false,
        error: "Webhook is disabled",
      });
      return;
    }
    let httpStatus: number | undefined;
    let error: string | undefined;
    let ok = false;
    try {
      const urlError = webhookUrlError(row.url);
      if (urlError) throw new Error(urlError);
      const signature = await signWebhookBody(row.secret, row.body);
      const response = await fetch(row.url, {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Id": args.deliveryId,
          "X-Webhook-Event": row.event,
          "X-Webhook-Signature": signature,
        },
        body: row.body,
        signal: AbortSignal.timeout(10_000),
      });
      httpStatus = response.status;
      ok = httpStatus >= 200 && httpStatus < 300;
      if (!ok) error = `HTTP ${httpStatus}`;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Delivery failed";
    }
    await ctx.runMutation(internal.webhooks.recordDeliveryResult, {
      deliveryId: args.deliveryId,
      ok,
      ...(httpStatus !== undefined ? { httpStatus } : {}),
      ...(error !== undefined ? { error: error.slice(0, 300) } : {}),
    });
  },
});
