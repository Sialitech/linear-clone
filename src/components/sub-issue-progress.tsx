export default function SubIssueProgress({
  done,
  total,
}: {
  done: number;
  total: number;
}) {
  if (total <= 0) return null;
  const ratio = Math.min(1, done / total);
  const degrees = Math.round(ratio * 360);
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
      title={`${done} of ${total} sub-issues done`}
    >
      <span
        className="size-3.5 shrink-0 rounded-full"
        style={{
          background: `conic-gradient(var(--color-foreground) ${degrees}deg, color-mix(in oklab, var(--color-foreground) 18%, transparent) ${degrees}deg)`,
        }}
        aria-hidden
      />
      <span className="font-mono">
        {done}/{total}
      </span>
    </span>
  );
}
