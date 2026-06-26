import { cn } from "@/lib/cn";

export type ConnStatus = "connecting" | "idle" | "running" | "disconnected" | "error";

const dotClasses: Record<ConnStatus, string> = {
  connecting: "bg-warning",
  idle: "bg-success",
  running: "bg-warning animate-pulse",
  disconnected: "bg-text-muted",
  error: "bg-danger",
};

interface StatusBadgeProps {
  status: ConnStatus;
  label: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[0.75rem] text-text-secondary",
        className
      )}
    >
      <span
        className={cn("h-2 w-2 rounded-full", dotClasses[status])}
        aria-hidden
      />
      {label}
    </span>
  );
}