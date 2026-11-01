import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nestIssues } from "../src/lib/issue-tree.ts";

describe("nestIssues", () => {
  const issues = [
    { _id: "parent", parentId: null },
    { _id: "other", parentId: null },
    { _id: "child-b", parentId: "parent" },
    { _id: "child-a", parentId: "parent" },
    { _id: "orphan", parentId: "missing" },
  ];

  it("places children under their parent in list order", () => {
    const rows = nestIssues(issues, true);
    assert.deepEqual(
      rows.map((row) => [row.issue._id, row.depth]),
      [
        ["parent", 0],
        ["child-b", 1],
        ["child-a", 1],
        ["other", 0],
        ["orphan", 0],
      ],
    );
  });

  it("hides children when sub-issues are off and the parent is in the list", () => {
    const rows = nestIssues(issues, false);
    assert.deepEqual(
      rows.map((row) => row.issue._id),
      ["parent", "other", "orphan"],
    );
  });
});