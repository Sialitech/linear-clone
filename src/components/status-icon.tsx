import { ISSUE_STATUS_LABELS, type IssueStatus } from "@convex/model";

const color: Record<IssueStatus, string> = {
  backlog: "#8b8f98",
  todo: "#e4e4e7",
  in_progress: "#f2c94c",
  in_review: "#4cb782",
  done: "#5e6ad2",
};

export default function StatusIcon({
  status,
  className = "size-3.5",
}: {
  status: IssueStatus;
  className?: string;
}) {
  const stroke = color[status];
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      {status === "backlog" ? (
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke={stroke}
          strokeWidth="1.5"
          strokeDasharray="2.2 2.15"
          strokeLinecap="round"
        />
      ) : null}
      {status === "todo" ? (
        <circle cx="8" cy="8" r="6" fill="none" stroke={stroke} strokeWidth="1.5" />
      ) : null}
      {status === "in_progress" ? (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke={stroke} strokeWidth="1.5" />
          <path fill={stroke} d="M8 8 L8 2 A6 6 0 0 1 8 14 Z" />
        </>
      ) : null}
      {status === "in_review" ? (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke={stroke} strokeWidth="1.5" />
          <path fill={stroke} d="M8 8 L8 2 A6 6 0 1 1 3.05 4.7 Z" />
        </>
      ) : null}
      {status === "done" ? (
        <>
          <circle cx="8" cy="8" r="6.25" fill={stroke} />
          <path
            d="M5.1 8.15 L7.05 10.05 L10.9 6.15"
            fill="none"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
    </svg>
  );
}

export function statusLabel(status: IssueStatus) {
  return ISSUE_STATUS_LABELS[status];
}
