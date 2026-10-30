import { ISSUE_STATUS_LABELS, type IssueStatus } from "@convex/model";
import { Circle, CircleCheck, CircleDashed, CircleDot, CirclePlay } from "lucide-react";

const color: Record<IssueStatus, string> = {
  backlog: "#8b8f98",
  todo: "#e4e4e7",
  in_progress: "#f2c94c",
  in_review: "#5e6ad2",
  done: "#4cb782",
};

export default function StatusIcon({
  status,
  className = "size-3.5",
}: {
  status: IssueStatus;
  className?: string;
}) {
  const props = { className, style: { color: color[status] }, "aria-hidden": true };
  if (status === "backlog") return <CircleDashed {...props} />;
  if (status === "todo") return <Circle {...props} />;
  if (status === "in_progress") return <CirclePlay {...props} />;
  if (status === "in_review") return <CircleDot {...props} />;
  return <CircleCheck {...props} />;
}

export function statusLabel(status: IssueStatus) {
  return ISSUE_STATUS_LABELS[status];
}
