"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  WEBHOOK_EVENT_GROUPS,
  WEBHOOK_EVENT_IDS,
  WEBHOOK_EVENT_LABELS,
  webhookSelectionLabel,
  type WebhookEvent,
} from "@convex/lib/webhookEvents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/format";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

export default function WebhooksSettings({ workspaceId }: { workspaceId: Id<"workspaces"> }) {
  const hooks = useQuery(api.webhooks.list, { workspaceId });
  const createWebhook = useMutation(api.webhooks.create);
  const updateWebhook = useMutation(api.webhooks.update);
  const rotateSecret = useMutation(api.webhooks.rotateSecret);
  const removeWebhook = useMutation(api.webhooks.remove);
  const sendTest = useMutation(api.webhooks.sendTest);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([...WEBHOOK_EVENT_IDS]);
  const [openId, setOpenId] = useState<Id<"webhooks"> | null>(null);

  const detail = useQuery(
    api.webhooks.get,
    openId ? { workspaceId, webhookId: openId } : "skip",
  );
  const deliveries = useQuery(
    api.webhooks.deliveries,
    openId ? { workspaceId, webhookId: openId } : "skip",
  );

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    if (events.length === 0) {
      toast.error("Choose at least one event");
      return;
    }
    try {
      const created = await createWebhook({ workspaceId, label, url, resources: events });
      setOpenId(created.id);
      setLabel("");
      setUrl("");
      toast.success("Webhook created");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section>
      <h2 className="text-sm font-medium">Webhooks</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Choose exactly which changes notify an https endpoint. A card move that only changes order is not an event.
      </p>
      <form onSubmit={(event) => void onCreate(event)} className="mt-3 space-y-3 rounded-md border border-border p-3">
        <div className="space-y-1.5">
          <Label htmlFor="webhook-label">Label</Label>
          <Input id="webhook-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Deploy bot" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="webhook-url">URL</Label>
          <Input
            id="webhook-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/hooks/linear"
            className="font-mono text-xs"
          />
        </div>
        <EventPicker idPrefix="webhook" selected={events} onChange={setEvents} />
        <Button type="submit" size="sm">Create webhook</Button>
      </form>
      <ul className="mt-3 space-y-2">
        {(hooks ?? []).map((hook) => (
          <li key={hook._id} className="rounded-md border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <button type="button" className="min-w-0 text-left" onClick={() => setOpenId(openId === hook._id ? null : hook._id)}>
                <span className="text-sm">{hook.label}</span>
                <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">{hook.url}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {webhookSelectionLabel(hook.resources)}
                  {hook.enabled ? "" : " · Disabled"}
                  {hook.lastDelivery
                    ? ` · ${hook.lastDelivery.event} ${hook.lastDelivery.status}${hook.lastDelivery.httpStatus ? ` ${hook.lastDelivery.httpStatus}` : ""}`
                    : " · No deliveries"}
                </span>
              </button>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void updateWebhook({ workspaceId, webhookId: hook._id, enabled: !hook.enabled })
                      .then(() => toast.success(hook.enabled ? "Webhook disabled" : "Webhook enabled"))
                      .catch((error: unknown) => toast.error(errorMessage(error)));
                  }}
                >
                  {hook.enabled ? "Disable" : "Enable"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void removeWebhook({ workspaceId, webhookId: hook._id })
                      .then(() => {
                        if (openId === hook._id) setOpenId(null);
                        toast.success("Webhook deleted");
                      })
                      .catch((error: unknown) => toast.error(errorMessage(error)));
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
            {hook.disabledReason ? <p className="mt-2 text-xs text-muted-foreground">{hook.disabledReason}</p> : null}
            {openId === hook._id && detail && detail._id === hook._id ? (
              <WebhookDetail
                detail={detail}
                deliveries={deliveries ?? []}
                onSave={(next) => updateWebhook({ workspaceId, webhookId: hook._id, ...next })}
                onRotate={() => rotateSecret({ workspaceId, webhookId: hook._id })}
                onTest={() => sendTest({ workspaceId, webhookId: hook._id })}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function WebhookDetail({
  detail,
  deliveries,
  onSave,
  onRotate,
  onTest,
}: {
  detail: {
    _id: Id<"webhooks">;
    label: string;
    url: string;
    resources: WebhookEvent[];
    enabled: boolean;
    secret: string;
  };
  deliveries: {
    _id: Id<"webhookDeliveries">;
    event: string;
    action: string;
    status: string;
    attempts: number;
    httpStatus: number | null;
    error: string | null;
    createdAt: number;
  }[];
  onSave: (next: { label: string; url: string; resources: WebhookEvent[] }) => Promise<unknown>;
  onRotate: () => Promise<unknown>;
  onTest: () => Promise<unknown>;
}) {
  const [label, setLabel] = useState(detail.label);
  const [url, setUrl] = useState(detail.url);
  const [events, setEvents] = useState<WebhookEvent[]>(detail.resources);

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (events.length === 0) {
            toast.error("Choose at least one event");
            return;
          }
          void onSave({ label, url, resources: events })
            .then(() => toast.success("Webhook saved"))
            .catch((error: unknown) => toast.error(errorMessage(error)));
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor={`webhook-edit-label-${detail._id}`}>Label</Label>
          <Input id={`webhook-edit-label-${detail._id}`} value={label} onChange={(event) => setLabel(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`webhook-edit-url-${detail._id}`}>URL</Label>
          <Input id={`webhook-edit-url-${detail._id}`} value={url} onChange={(event) => setUrl(event.target.value)} className="font-mono text-xs" />
        </div>
        <EventPicker idPrefix={`webhook-edit-${detail._id}`} selected={events} onChange={setEvents} />
        <Button type="submit" size="sm">Save webhook</Button>
      </form>
      <div className="space-y-1.5">
        <Label htmlFor={`webhook-secret-${detail._id}`}>Signing secret</Label>
        <Input id={`webhook-secret-${detail._id}`} readOnly value={detail.secret} className="font-mono text-xs" />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(detail.secret).then(
                () => toast.success("Secret copied"),
                () => toast.error("Could not copy the secret"),
              );
            }}
          >
            Copy secret
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void onRotate()
                .then(() => toast.success("Secret rotated"))
                .catch((error: unknown) => toast.error(errorMessage(error)));
            }}
          >
            Rotate secret
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!detail.enabled}
            onClick={() => {
              void onTest()
                .then(() => toast.success("Test delivery queued"))
                .catch((error: unknown) => toast.error(errorMessage(error)));
            }}
          >
            Send test
          </Button>
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Recent deliveries</p>
        {deliveries.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">No deliveries yet.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {deliveries.map((delivery) => (
              <li key={delivery._id}>
                {new Date(delivery.createdAt).toLocaleString()} · {eventLabel(delivery.event)} · {delivery.status}
                {delivery.httpStatus ? ` · HTTP ${delivery.httpStatus}` : ""}
                {delivery.attempts > 1 ? ` · ${delivery.attempts} attempts` : ""}
                {delivery.error ? ` · ${delivery.error}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function eventLabel(event: string) {
  return event in WEBHOOK_EVENT_LABELS ? WEBHOOK_EVENT_LABELS[event as WebhookEvent] : event;
}

function EventPicker({
  idPrefix,
  selected,
  onChange,
}: {
  idPrefix: string;
  selected: WebhookEvent[];
  onChange: (next: WebhookEvent[]) => void;
}) {
  function toggle(event: WebhookEvent, checked: boolean) {
    onChange(checked ? [...selected, event] : selected.filter((item) => item !== event));
  }

  function toggleGroup(events: readonly WebhookEvent[], clear: boolean) {
    const group = new Set<string>(events);
    if (clear) {
      onChange(selected.filter((event) => !group.has(event)));
      return;
    }
    onChange(WEBHOOK_EVENT_IDS.filter((event) => selected.includes(event) || group.has(event)));
  }

  return (
    <div className="space-y-3">
      {WEBHOOK_EVENT_GROUPS.map((group) => {
        const allOn = group.events.every((event) => selected.includes(event));
        return (
          <fieldset key={group.id}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <legend className="text-xs font-medium">{group.label}</legend>
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => toggleGroup(group.events, allOn)}
              >
                {allOn ? "Clear" : "All"}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {group.events.map((event) => (
                <label key={event} className="flex items-center gap-2 text-xs" htmlFor={`${idPrefix}-${event}`}>
                  <input
                    id={`${idPrefix}-${event}`}
                    type="checkbox"
                    checked={selected.includes(event)}
                    onChange={(change) => toggle(event, change.target.checked)}
                  />
                  {WEBHOOK_EVENT_LABELS[event]}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
