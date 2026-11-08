import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  commentChangeEvents,
  expandWebhookResources,
  issueChangeEvents,
  subscribesTo,
  type IssueChangeSnapshot,
} from "../convex/lib/webhookEvents.ts";
import { retryDelayMs, updatedFrom, webhookBody } from "../convex/lib/webhookPayload.ts";
import { signWebhookBody } from "../convex/lib/webhookSign.ts";
import { assertWebhookUrl, webhookUrlError } from "../convex/lib/webhookUrl.ts";

describe("webhook signature", () => {
  it("signs the raw body with HMAC-SHA256", async () => {
    const secret = "whsec_test";
    const body = '{"action":"create","type":"Ping"}';
    const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    assert.equal(await signWebhookBody(secret, body), expected);
    assert.notEqual(await signWebhookBody("whsec_other", body), expected);
  });
});

describe("webhook URLs", () => {
  const rejected = [
    "http://example.com/hook",
    "https://user:pass@example.com/hook",
    "https://localhost/hook",
    "https://app.localhost/hook",
    "https://printer.local/hook",
    "https://127.0.0.1/hook",
    "https://10.1.2.3/hook",
    "https://192.168.1.10/hook",
    "https://172.16.0.4/hook",
    "https://169.254.169.254/hook",
    "https://0.0.0.1/hook",
    "https://[::1]/hook",
    "https://[fd12:3456:789a::1]/hook",
    "https://[fe80::1]/hook",
    "https://[::ffff:127.0.0.1]/hook",
    "https://metadata.google.internal/hook",
  ];

  for (const url of rejected) {
    it(`rejects ${url}`, () => {
      assert.equal(typeof webhookUrlError(url), "string");
      assert.throws(() => assertWebhookUrl(url));
    });
  }

  it("accepts a public https URL", () => {
    assert.equal(webhookUrlError("  https://hooks.example.com:8443/linear  "), null);
    assert.equal(assertWebhookUrl("  https://hooks.example.com:8443/linear  "), "https://hooks.example.com:8443/linear");
    assert.equal(webhookUrlError("https://8.8.8.8/hook"), null);
    assert.equal(webhookUrlError("https://[2001:4860:4860::8888]/hook"), null);
    assert.equal(webhookUrlError("https://172.15.0.1/hook"), null);
    assert.equal(webhookUrlError("https://172.32.0.1/hook"), null);
  });
});

function snapshot(overrides: Partial<IssueChangeSnapshot> = {}): IssueChangeSnapshot {
  return {
    title: "Ship it",
    description: "",
    status: "todo",
    priority: "none",
    assigneeId: null,
    projectId: "project_1",
    identifier: "ENG-1",
    labelIds: [],
    dueDate: null,
    cycleId: null,
    parentId: null,
    snoozedUntil: null,
    ...overrides,
  };
}

describe("webhook event selection", () => {
  it("emits one event per changed field", () => {
    const events = issueChangeEvents(
      snapshot({ status: "todo", assigneeId: null }),
      snapshot({ status: "in_progress", assigneeId: "user_1" }),
    );
    assert.deepEqual(
      events.map((event) => event.event),
      ["issue.status_changed", "issue.assignee_changed"],
    );
    assert.deepEqual(events[0]?.updatedFrom, { status: "todo" });
    assert.deepEqual(events[1]?.updatedFrom, { assigneeId: null });
  });

  it("distinguishes due date set, change, and clear", () => {
    assert.equal(issueChangeEvents(snapshot(), snapshot({ dueDate: 10 }))[0]?.event, "issue.due_date_set");
    assert.equal(
      issueChangeEvents(snapshot({ dueDate: 10 }), snapshot({ dueDate: 20 }))[0]?.event,
      "issue.due_date_changed",
    );
    assert.equal(
      issueChangeEvents(snapshot({ dueDate: 10 }), snapshot())[0]?.event,
      "issue.due_date_cleared",
    );
  });

  it("ignores label order and card order", () => {
    assert.deepEqual(
      issueChangeEvents(snapshot({ labelIds: ["b", "a"] }), snapshot({ labelIds: ["a", "b"] })),
      [],
    );
  });

  it("splits label adds and removes", () => {
    const events = issueChangeEvents(
      snapshot({ labelIds: ["keep", "old"] }),
      snapshot({ labelIds: ["keep", "new"] }),
    );
    assert.deepEqual(
      events.map((event) => event.event),
      ["issue.labels_added", "issue.labels_removed"],
    );
  });

  it("treats a legacy Issue subscription as every issue event", () => {
    assert.equal(subscribesTo(["Issue"], "issue.status_changed"), true);
    assert.equal(subscribesTo(["Issue"], "comment.created"), false);
    assert.equal(subscribesTo(["issue.assignee_changed"], "issue.assignee_changed"), true);
    assert.ok(expandWebhookResources(["Comment"]).includes("comment.deleted"));
  });

  it("emits comment.edited only when content or mentions change", () => {
    assert.deepEqual(commentChangeEvents({ content: "A", mentionIds: [] }, { content: "A", mentionIds: [] }), []);
    assert.equal(
      commentChangeEvents({ content: "A", mentionIds: [] }, { content: "B", mentionIds: ["user_1"] }).length,
      1,
    );
  });
});

describe("webhook payload diff", () => {
  it("keeps only the previous value of fields that changed", () => {
    const diff = updatedFrom(
      { title: "Old", status: "todo", assigneeId: null, labelIds: ["a", "b"] },
      { title: "New", status: "todo", assigneeId: "user_1", labelIds: ["a", "b"] },
    );
    assert.deepEqual(diff, { title: "Old", assigneeId: null });
  });

  it("returns undefined when nothing changed", () => {
    assert.equal(
      updatedFrom(
        { title: "Same", labelIds: ["b", "a"] },
        { title: "Same", labelIds: ["b", "a"] },
      ),
      undefined,
    );
  });

  it("treats array order as part of the value", () => {
    assert.deepEqual(
      updatedFrom({ labelIds: ["b", "a"] }, { labelIds: ["a", "b"] }),
      { labelIds: ["b", "a"] },
    );
  });

  it("omits updatedFrom when there is no diff", () => {
    const body = JSON.parse(
      webhookBody({
        action: "create",
        type: "Issue",
        createdAt: "2026-11-08T00:00:00.000Z",
        data: { id: "issue_1", title: "Ship it" },
      }),
    ) as { updatedFrom?: unknown; type: string };
    assert.equal(body.type, "Issue");
    assert.equal("updatedFrom" in body, false);
  });

  it("retries after 30s, 2m, 10m, and 1h, then stops", () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5].map((attempt) => retryDelayMs(attempt)),
      [30_000, 120_000, 600_000, 3_600_000, null],
    );
  });
});
