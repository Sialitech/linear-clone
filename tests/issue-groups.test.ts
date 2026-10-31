import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupIssues, type GroupableIssue } from "../src/lib/issue-groups.ts";

function issue(overrides: Partial<GroupableIssue> & Pick<GroupableIssue, "_id">): GroupableIssue {
  return {
    updatedAt: 1,
    status: "todo",
    priority: "none",
    projectId: "project-a",
    projectName: "Alpha",
    assignee: null,
    ...overrides,
  };
}

describe("groupIssues", () => {
  const issues = [
    issue({
      _id: "1",
      status: "done",
      priority: "low",
      updatedAt: 10,
      assignee: { _id: "u2", name: "Diana", email: null },
      projectId: "project-b",
      projectName: "Beta",
    }),
    issue({
      _id: "2",
      status: "todo",
      priority: "urgent",
      updatedAt: 30,
      assignee: { _id: "u1", name: "Andrea", email: null },
    }),
    issue({
      _id: "3",
      status: "todo",
      priority: "high",
      updatedAt: 20,
      assignee: null,
    }),
    issue({
      _id: "4",
      status: "in_progress",
      priority: "urgent",
      updatedAt: 40,
      assignee: { _id: "u1", name: "Andrea", email: null },
    }),
  ];

  it("groups by status in workflow order and sorts issues by recency", () => {
    const groups = groupIssues(issues, "status");
    assert.deepEqual(
      groups.map((group) => [group.label, group.issues.map((item) => item._id)]),
      [
        ["Todo", ["2", "3"]],
        ["In Progress", ["4"]],
        ["Done", ["1"]],
      ],
    );
  });

  it("groups by assignee with unassigned last", () => {
    const groups = groupIssues(issues, "assignee");
    assert.deepEqual(
      groups.map((group) => [group.key, group.label, group.issues.length]),
      [
        ["u1", "Andrea", 2],
        ["u2", "Diana", 1],
        ["unassigned", "Unassigned", 1],
      ],
    );
  });

  it("groups by priority from urgent to none", () => {
    const groups = groupIssues(issues, "priority");
    assert.deepEqual(
      groups.map((group) => group.key),
      ["urgent", "high", "low"],
    );
  });

  it("groups by project name", () => {
    const groups = groupIssues(issues, "project");
    assert.deepEqual(
      groups.map((group) => group.label),
      ["Alpha", "Beta"],
    );
  });
});
