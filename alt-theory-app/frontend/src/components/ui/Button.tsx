import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-surface hover:bg-ink-soft disabled:bg-text-muted disabled:text-surface/80",
  secondary:
    "border border-hairline bg-surface/80 text-text-secondary hover:bg-surface disabled:text-text-muted",
  ghost:
    "bg-transparent text-text-secondary hover:bg-hover disabled:text-text-muted",
};

export function Button({
  variant = "secondary",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-8 items-center justify-center rounded-md px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
