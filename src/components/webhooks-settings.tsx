"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
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
  const [issueEvents, setIssueEvents] = useState(true);
  const [commentEvents, setCommentEvents] = useState(true);
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
    const resources = [
      ...(issueEvents ? (["Issue"] as const) : []),
      ...(commentEvents ? (["Comment"] as const) : []),
    ];
    if (resources.length === 0) {
      toast.error("Choose Issue, Comment, or both");
      return;
    }
    try {
      const created = await createWebhook({ workspaceId, label, url, resources });
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
        Notify an https endpoint when an issue or comment changes. Requests are signed with HMAC-SHA256 and are not sent when a card only changes order.
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
        <fieldset className="flex gap-4 text-xs">
          <legend className="mb-1 text-xs text-muted-foreground">Events</legend>
          <label className="flex items-center gap-2" htmlFor="webhook-issue">
            <input id="webhook-issue" type="checkbox" checked={issueEvents} onChange={(event) => setIssueEvents(event.target.checked)} />
            Issue
          </label>
          <label className="flex items-center gap-2" htmlFor="webhook-comment">
            <input
              id="webhook-comment"
              type="checkbox"
              checked={commentEvents}
              onChange={(event) => setCommentEvents(event.target.checked)}
            />
            Comment
          </label>
        </fieldset>
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
                  {hook.resources.join(", ")}
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
    resources: ("Issue" | "Comment")[];
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
  onSave: (next: { label: string; url: string; resources: ("Issue" | "Comment")[] }) => Promise<unknown>;
  onRotate: () => Promise<unknown>;
  onTest: () => Promise<unknown>;
}) {
  const [label, setLabel] = useState(detail.label);
  const [url, setUrl] = useState(detail.url);
  const [issueEvents, setIssueEvents] = useState(detail.resources.includes("Issue"));
  const [commentEvents, setCommentEvents] = useState(detail.resources.includes("Comment"));

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const resources = [
            ...(issueEvents ? (["Issue"] as const) : []),
            ...(commentEvents ? (["Comment"] as const) : []),
          ];
          if (resources.length === 0) {
            toast.error("Choose Issue, Comment, or both");
            return;
          }
          void onSave({ label, url, resources })
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
        <fieldset className="flex gap-4 text-xs">
          <legend className="mb-1 text-xs text-muted-foreground">Events</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={issueEvents} onChange={(event) => setIssueEvents(event.target.checked)} />
            Issue
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={commentEvents} onChange={(event) => setCommentEvents(event.target.checked)} />
            Comment
          </label>
        </fieldset>
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
                {new Date(delivery.createdAt).toLocaleString()} · {delivery.event} {delivery.action} · {delivery.status}
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
