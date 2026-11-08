import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
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
