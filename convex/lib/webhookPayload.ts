export const WEBHOOK_LIMIT = 10;
export const WEBHOOK_DELIVERY_LIMIT = 50;
export const WEBHOOK_MAX_ATTEMPTS = 5;
export const WEBHOOK_FAILURES_BEFORE_DISABLE = 10;

const RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 3_600_000] as const;

export type WebhookValue = string | number | null | string[];

export function updatedFrom<T extends Record<string, WebhookValue>>(before: T, after: T) {
  const diff: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (!sameValue(before[key], after[key])) diff[key] = before[key];
  }
  return Object.keys(diff).length > 0 ? diff : undefined;
}

export function webhookBody(args: {
  action: "create" | "update" | "remove";
  type: string;
  createdAt: string;
  data: object;
  updatedFrom?: object;
  related?: { id: string; identifier: string };
}) {
  return JSON.stringify({
    action: args.action,
    type: args.type,
    createdAt: args.createdAt,
    data: args.data,
    ...(args.updatedFrom ? { updatedFrom: args.updatedFrom } : {}),
    ...(args.related ? { related: args.related } : {}),
  });
}

export function retryDelayMs(attemptsSoFar: number) {
  if (attemptsSoFar < 1 || attemptsSoFar >= WEBHOOK_MAX_ATTEMPTS) return null;
  return RETRY_DELAYS_MS[attemptsSoFar - 1] ?? null;
}

function sameValue(left: WebhookValue | undefined, right: WebhookValue | undefined) {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => item === right[index]);
  }
  return left === right;
}
