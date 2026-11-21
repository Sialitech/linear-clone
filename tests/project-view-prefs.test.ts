import assert from "node:assert/strict";
import test from "node:test";
import { parseProjectView, pruneIds, serializeProjectView } from "../src/lib/project-view-prefs.ts";

const allowed = {
  statuses: ["todo", "in_progress", "done"],
  priorities: ["urgent", "none"],
  groups: ["status", "priority"],
  orders: ["updated", "priority"],
};

test("devuelve null con datos vacíos o corruptos", () => {
  assert.equal(parseProjectView(null, allowed), null);
  assert.equal(parseProjectView("{no es json", allowed), null);
  assert.equal(parseProjectView("42", allowed), null);
});

test("ida y vuelta conserva filtros y display", () => {
  const view = {
    filters: { projectId: null, statuses: ["todo", "in_progress"], priorities: ["urgent"], assignees: ["me", "u1"], labelIds: ["l1"] },
    display: { groupBy: "status", subGroupBy: null, orderBy: "updated", showSubIssues: false },
  };
  assert.deepEqual(parseProjectView(serializeProjectView(view), allowed), view);
});

test("descarta valores que ya no existen o tienen mal tipo", () => {
  const raw = JSON.stringify({
    filters: { statuses: ["todo", "borrado", 3, "todo"], priorities: "urgent", assignees: [1, "me"] },
    display: { groupBy: "project", orderBy: "updated", showSubIssues: "si" },
  });
  const parsed = parseProjectView(raw, allowed);
  assert.deepEqual(parsed?.filters.statuses, ["todo"]);
  assert.deepEqual(parsed?.filters.priorities, []);
  assert.deepEqual(parsed?.filters.assignees, ["me"]);
  assert.equal(parsed?.display.groupBy, null);
  assert.equal(parsed?.display.orderBy, "updated");
  assert.equal(parsed?.display.showSubIssues, true);
});

test("pruneIds quita ids inexistentes y respeta los valores fijos", () => {
  assert.deepEqual(pruneIds(["me", "u1", "u2"], new Set(["u2"]), ["me", "unassigned"]), ["me", "u2"]);
});
