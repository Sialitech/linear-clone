import { PRIORITY_LABELS, type Priority } from "@convex/model";
import { Minus, Signal, SignalHigh, SignalLow, SignalMedium } from "lucide-react";

const color: Record<Priority, string> = {
  urgent: "#f2555a",
  high: "#f2994a",
  medium: "#f2c94c",
  low: "#5e6ad2",
  none: "#6b6f76",
};

export default function PriorityIcon({
  priority,
  className = "size-3.5",
}: {
  priority: Priority;
  className?: string;
}) {
  const props = { className, style: { color: color[priority] }, "aria-hidden": true };
  if (priority === "urgent") return <Signal {...props} />;
  if (priority === "high") return <SignalHigh {...props} />;
  if (priority === "medium") return <SignalMedium {...props} />;
  if (priority === "low") return <SignalLow {...props} />;
  return <Minus {...props} />;
}

export function priorityLabel(priority: Priority) {
  return PRIORITY_LABELS[priority];
}
