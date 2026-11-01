export type TreeIssue = {
  _id: string;
  parentId: string | null;
};

export type TreeRow<T> = {
  issue: T;
  depth: number;
};

export function nestIssues<T extends TreeIssue>(issues: T[], showSubIssues: boolean): TreeRow<T>[] {
  const ids = new Set(issues.map((issue) => issue._id));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const issue of issues) {
    const parentId = issue.parentId;
    if (parentId && ids.has(parentId)) {
      const list = children.get(parentId) ?? [];
      list.push(issue);
      children.set(parentId, list);
    } else {
      roots.push(issue);
    }
  }
  if (!showSubIssues) {
    return roots.map((issue) => ({ issue, depth: 0 }));
  }
  const rows: TreeRow<T>[] = [];
  function walk(issue: T, depth: number) {
    rows.push({ issue, depth });
    for (const child of children.get(issue._id) ?? []) walk(child, depth + 1);
  }
  for (const root of roots) walk(root, 0);
  return rows;
}
