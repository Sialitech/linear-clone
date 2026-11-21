import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasAnyFilter,
  issueMatchesListFilters,
  normalizeFilters,
  toggleValue,
  toListFilters,
} from "../convex/lib/viewFilters.ts";

describe("normalizeFilters", () => {
  it("reads the legacy single-value fields", () => {
    const filters = normalizeFilters({
      status: "todo",
      priority: "high",
      labelId: "l1",
      assigneeMode: "user",
      assigneeId: "u1",
    });
    assert.deepEqual(filters, {
      statuses: ["todo"],
      priorities: ["high"],
      assignees: ["u1"],
      labelIds: ["l1"],
    });
  });

  it("maps legacy assignee modes", () => {
    assert.deepEqual(normalizeFilters({ assigneeMode: "me" }).assignees, ["me"]);
    assert.deepEqual(normalizeFilters({ assigneeMode: "unassigned" }).assignees, ["unassigned"]);
    assert.deepEqual(normalizeFilters({ assigneeMode: "anyone" }).assignees, []);
  });

  it("prefers the multi-select arrays and removes duplicates", () => {
    const filters = normalizeFilters({
      status: "done",
      statuses: ["todo", "in_progress", "todo"],
      assignees: ["me", "unassigned"],
    });
    assert.deepEqual(filters.statuses, ["todo", "in_progress"]);
    assert.deepEqual(filters.assignees, ["me", "unassigned"]);
  });

  it("keeps an explicitly empty array as no filter", () => {
    assert.deepEqual(normalizeFilters({ status: "todo", statuses: [] }).statuses, []);
  });
});

describe("toListFilters", () => {
  it("resolves me and splits unassigned", () => {
    const args = toListFilters(
      { statuses: ["todo", "in_progress"], priorities: [], assignees: ["me", "unassigned", "u2"], labelIds: [] },
      "u1",
    );
    assert.deepEqual(args, {
      statuses: ["todo", "in_progress"],
      assigneeIds: ["u1", "u2"],
      unassigned: true,
    });
  });

  it("omits empty filters", () => {
    assert.deepEqual(toListFilters({ statuses: [], priorities: [], assignees: [], labelIds: [] }, "u1"), {});
  });
});

describe("issueMatchesListFilters", () => {
  const issue = { status: "todo", priority: "high", assigneeId: "u1", labelIds: ["a", "b"] };

  it("matches any selected value within a field", () => {
    assert.equal(issueMatchesListFilters(issue, { statuses: ["todo", "in_progress"] }), true);
    assert.equal(issueMatchesListFilters(issue, { statuses: ["done", "in_progress"] }), false);
    assert.equal(issueMatchesListFilters(issue, { labelIds: ["z", "b"] }), true);
  });

  it("requires every field to match", () => {
    assert.equal(issueMatchesListFilters(issue, { statuses: ["todo"], priorities: ["low"] }), false);
  });

  it("combines assignees and unassigned with OR", () => {
    assert.equal(issueMatchesListFilters(issue, { assigneeIds: ["u2"], unassigned: true }), false);
    assert.equal(issueMatchesListFilters({ ...issue, assigneeId: undefined }, { assigneeIds: ["u2"], unassigned: true }), true);
    assert.equal(issueMatchesListFilters(issue, { assigneeIds: ["u1", "u2"], unassigned: true }), true);
  });
});

describe("helpers", () => {
  it("toggles values", () => {
    assert.deepEqual(toggleValue(["a"], "b"), ["a", "b"]);
    assert.deepEqual(toggleValue(["a", "b"], "a"), ["b"]);
  });

  it("detects active filters", () => {
    assert.equal(hasAnyFilter({ statuses: [], priorities: [], assignees: [], labelIds: [] }), false);
    assert.equal(hasAnyFilter({ statuses: ["todo"], priorities: [], assignees: [], labelIds: [] }), true);
  });
});
