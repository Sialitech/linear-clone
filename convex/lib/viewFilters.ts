// Lógica pura de filtros multiselección compartida por el servidor y el cliente.
// Sin imports: tiene que poder ejecutarse con `node --test`.

export type AssigneeRef<U extends string = string> = "me" | "unassigned" | U;

type LegacyAssigneeMode = "anyone" | "me" | "unassigned" | "user";

/** Campos de filtro de una vista tal como están guardados (los singulares son anteriores a la multiselección). */
export type StoredFilters<S extends string, P extends string, U extends string, L extends string> = {
  status?: S;
  statuses?: S[];
  priority?: P;
  priorities?: P[];
  assigneeMode?: LegacyAssigneeMode;
  assigneeId?: U;
  assignees?: AssigneeRef<U>[];
  labelId?: L;
  labelIds?: L[];
};

export type Filters<S extends string, P extends string, U extends string, L extends string> = {
  statuses: S[];
  priorities: P[];
  assignees: AssigneeRef<U>[];
  labelIds: L[];
};

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/** Une los campos nuevos con los singulares antiguos. Un array vacío significa «sin filtro». */
export function normalizeFilters<S extends string, P extends string, U extends string, L extends string>(
  stored: StoredFilters<S, P, U, L>,
): Filters<S, P, U, L> {
  const statuses = stored.statuses ?? (stored.status ? [stored.status] : []);
  const priorities = stored.priorities ?? (stored.priority ? [stored.priority] : []);
  const labelIds = stored.labelIds ?? (stored.labelId ? [stored.labelId] : []);
  let assignees: AssigneeRef<U>[];
  if (stored.assignees) {
    assignees = stored.assignees;
  } else if (stored.assigneeMode === "me") {
    assignees = ["me"];
  } else if (stored.assigneeMode === "unassigned") {
    assignees = ["unassigned"];
  } else if (stored.assigneeMode === "user" && stored.assigneeId) {
    assignees = [stored.assigneeId];
  } else {
    assignees = [];
  }
  return {
    statuses: unique(statuses),
    priorities: unique(priorities),
    assignees: unique(assignees),
    labelIds: unique(labelIds),
  };
}

export type ListFilters<S extends string, P extends string, U extends string, L extends string> = {
  statuses?: S[];
  priorities?: P[];
  assigneeIds?: U[];
  unassigned?: true;
  labelIds?: L[];
};

/** Traduce los filtros a los argumentos de `issues.list`. `me` se resuelve con el usuario actual. */
export function toListFilters<S extends string, P extends string, U extends string, L extends string>(
  filters: Filters<S, P, U, L>,
  meId: U | undefined,
): ListFilters<S, P, U, L> {
  const assigneeIds: U[] = [];
  let unassigned = false;
  for (const ref of filters.assignees) {
    if (ref === "unassigned") unassigned = true;
    else if (ref === "me") {
      if (meId) assigneeIds.push(meId);
    } else assigneeIds.push(ref);
  }
  return {
    ...(filters.statuses.length > 0 ? { statuses: filters.statuses } : {}),
    ...(filters.priorities.length > 0 ? { priorities: filters.priorities } : {}),
    ...(assigneeIds.length > 0 ? { assigneeIds: unique(assigneeIds) } : {}),
    ...(unassigned ? { unassigned: true as const } : {}),
    ...(filters.labelIds.length > 0 ? { labelIds: filters.labelIds } : {}),
  };
}

export function hasAnyFilter(filters: Filters<string, string, string, string>): boolean {
  return (
    filters.statuses.length > 0 ||
    filters.priorities.length > 0 ||
    filters.assignees.length > 0 ||
    filters.labelIds.length > 0
  );
}

/** Añade o quita un valor de una lista, conservando el orden de selección. */
export function toggleValue<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export type IssueFilterShape = {
  status: string;
  priority: string;
  assigneeId?: string;
  labelIds: readonly string[];
};

/** Coincidencia dentro de un campo es OR; entre campos distintos es AND. */
export function issueMatchesListFilters(
  issue: IssueFilterShape,
  filters: ListFilters<string, string, string, string>,
): boolean {
  if (filters.statuses && !filters.statuses.includes(issue.status)) return false;
  if (filters.priorities && !filters.priorities.includes(issue.priority)) return false;
  if (filters.assigneeIds || filters.unassigned) {
    const byUser = issue.assigneeId !== undefined && (filters.assigneeIds?.includes(issue.assigneeId) ?? false);
    const byNone = issue.assigneeId === undefined && filters.unassigned === true;
    if (!byUser && !byNone) return false;
  }
  if (filters.labelIds && !filters.labelIds.some((id) => issue.labelIds.includes(id))) return false;
  return true;
}
