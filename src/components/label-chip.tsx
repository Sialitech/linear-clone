export default function LabelChip({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex max-w-28 items-center gap-1 truncate rounded-full bg-white/6 px-1.5 py-0.5 text-[11px] text-foreground/85">
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{name}</span>
    </span>
  );
}
