import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MCP_TOOLS } from "../convex/mcpProtocol.ts";
import { ISSUE_STATUSES, splitTriage, WORKFLOW_STATUSES } from "../convex/model.ts";

describe("triage queue", () => {
  const now = Date.parse("2026-11-06T12:00:00.000Z");

  it("keeps future snoozes out of the waiting list and sorts by priority", () => {
    const queue = splitTriage(
      [
        { id: "low", snoozedUntil: null, priority: "low" as const, createdAt: 1 },
        { id: "urgent", snoozedUntil: null, priority: "urgent" as const, createdAt: 3 },
        { id: "later", snoozedUntil: now + 86_400_000, priority: "high" as const, createdAt: 2 },
        { id: "due", snoozedUntil: now - 1, priority: "medium" as const, createdAt: 4 },
      ],
      now,
    );
    assert.deepEqual(
      queue.waiting.map((issue) => issue.id),
      ["urgent", "due", "low"],
    );
    assert.deepEqual(
      queue.snoozed.map((issue) => issue.id),
      ["later"],
    );
  });
});

describe("triage MCP tools", () => {
  it("publishes list_triage and triage_issue with the issue statuses", () => {
    const names = MCP_TOOLS.map((tool) => tool.name);
    assert.ok(names.includes("list_triage"));
    assert.ok(names.includes("triage_issue"));
    const listIssues = MCP_TOOLS.find((tool) => tool.name === "list_issues");
    const status = listIssues?.inputSchema.properties.status;
    assert.ok(status && "enum" in status);
    assert.deepEqual(status.enum, [...ISSUE_STATUSES]);
    const triage = MCP_TOOLS.find((tool) => tool.name === "triage_issue");
    const acceptStatus = triage?.inputSchema.properties.status;
    assert.ok(acceptStatus && "enum" in acceptStatus);
    assert.deepEqual(acceptStatus.enum, [...WORKFLOW_STATUSES]);
  });
});
