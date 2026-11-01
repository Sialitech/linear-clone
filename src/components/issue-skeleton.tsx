import { cn } from "@/lib/utils";

const TITLE_WIDTHS = ["42%", "68%", "54%", "76%", "48%", "61%", "36%", "72%"];

function Bar({ className, style }: { className?: string; style?: { width: string } }) {
  return <div className={cn("animate-pulse rounded-md bg-white/8", className)} style={style} />;
}

export default function IssueSkeleton({ variant = "list" }: { variant?: "list" | "board" }) {
  if (variant === "board") {
    return (
      <div
        className="flex min-h-0 flex-1 gap-3 overflow-hidden p-3 sm:p-4"
        aria-busy="true"
        aria-label="Loading board"
      >
        {Array.from({ length: 5 }, (_, column) => (
          <section
            key={column}
            className="flex h-full w-[min(78vw,272px)] shrink-0 flex-col rounded-lg bg-white/[0.02] md:w-[272px]"
          >
            <header className="flex items-center gap-2 px-2 py-2">
              <Bar className="size-3.5 rounded-full" />
              <Bar className="h-3 w-16" />
            </header>
            <div className="flex flex-col gap-1.5 px-1.5 pb-2">
              {Array.from({ length: column % 2 === 0 ? 3 : 2 }, (_, card) => (
                <div key={card} className="rounded-md border border-border bg-card px-2.5 py-2">
                  <Bar className="h-3 w-4/5" />
                  <Bar className="mt-2 h-3 w-2/5" />
                  <div className="mt-3 flex items-center gap-2">
                    <Bar className="h-2.5 w-10" />
                    <Bar className="ml-auto size-5 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1" aria-busy="true" aria-label="Loading issues">
      {TITLE_WIDTHS.map((width, index) => (
        <div
          key={index}
          className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5 sm:px-4"
        >
          <Bar className="size-3.5 shrink-0 rounded-sm" />
          <Bar className="size-3.5 shrink-0 rounded-full" />
          <Bar className="h-3 w-12 shrink-0" />
          <Bar className="size-3.5 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Bar className="h-3 max-w-full" style={{ width }} />
          </div>
          <Bar className="hidden h-4 w-14 shrink-0 sm:block" />
          <Bar className="size-5 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}
