import type { ReactNode } from "react";

export type StatusChipTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

interface StatusChipProps {
  children: ReactNode;
  className?: string;
  tone?: StatusChipTone;
  status?: string;
  dot?: boolean;
  title?: string;
  ariaLabel?: string;
}

const StatusChip = ({
  children,
  className = "",
  tone = "neutral",
  status,
  dot = false,
  title,
  ariaLabel,
}: StatusChipProps) => {
  const classes = [
    "status-chip",
    `status-chip--${tone}`,
    status ? `status-chip--status-${status}` : "",
    dot ? "status-chip--dot" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} title={title} aria-label={ariaLabel}>
      {dot && <span className="status-chip__dot" aria-hidden="true" />}
      {children}
    </span>
  );
};

export default StatusChip;
