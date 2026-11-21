// Opciones de vista de un proyecto (filtros y display) guardadas en el navegador.
// Módulo puro: no toca `localStorage` ni importa nada, para poder probarlo con `node --test`.

export type StoredProjectView = {
  filters: {
    projectId: string | null;
    statuses: string[];
    priorities: string[];
    assignees: string[];
    labelIds: string[];
  };
  display: {
    groupBy: string | null;
    subGroupBy: string | null;
    orderBy: string | null;
    showSubIssues: boolean;
  };
};

export type AllowedValues = {
  statuses: readonly string[];
  priorities: readonly string[];
  groups: readonly string[];
  orders: readonly string[];
};

export const projectViewKey = (projectId: string) => `linear-clone:project-view:${projectId}`;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string"))] : [];
}

function oneOf(value: unknown, allowed: readonly string[]): string | null {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

/** Lee lo guardado descartando todo lo que no sea válido. Devuelve `null` si no hay nada utilizable. */
export function parseProjectView(raw: string | null, allowed: AllowedValues): StoredProjectView | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { filters, display } = data as { filters?: Record<string, unknown>; display?: Record<string, unknown> };
  const f = filters ?? {};
  const d = display ?? {};
  return {
    filters: {
      projectId: typeof f.projectId === "string" ? f.projectId : null,
      statuses: strings(f.statuses).filter((s) => allowed.statuses.includes(s)),
      priorities: strings(f.priorities).filter((p) => allowed.priorities.includes(p)),
      // «me» y «unassigned» son valores fijos; el resto son ids de usuario.
      assignees: strings(f.assignees),
      labelIds: strings(f.labelIds),
    },
    display: {
      groupBy: oneOf(d.groupBy, allowed.groups),
      subGroupBy: oneOf(d.subGroupBy, allowed.groups),
      orderBy: oneOf(d.orderBy, allowed.orders),
      showSubIssues: typeof d.showSubIssues === "boolean" ? d.showSubIssues : true,
    },
  };
}

export function serializeProjectView(view: StoredProjectView): string {
  return JSON.stringify(view);
}

/** Quita ids que ya no existen (etiquetas borradas, miembros que se fueron). */
export function pruneIds<T extends string>(selected: readonly T[], existing: ReadonlySet<string>, keep: readonly string[] = []): T[] {
  return selected.filter((id) => keep.includes(id) || existing.has(id));
}
