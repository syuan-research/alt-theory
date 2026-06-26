import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface TextProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

export function PageTitle({ children, className }: TextProps) {
  return (
    <h1
      className={cn(
        "text-[1.375rem] font-semibold leading-[1.2] text-ink",
        className
      )}
    >
      {children}
    </h1>
  );
}

export function BrandTitle({ children, className }: TextProps) {
  return (
    <h1
      className={cn(
        "font-[family-name:var(--font-brand)] text-[1.375rem] font-medium leading-[1.15] text-ink",
        className
      )}
    >
      {children}
    </h1>
  );
}

export function SectionTitle({ children, className }: TextProps) {
  return (
    <h2
      className={cn(
        "text-[0.75rem] font-semibold uppercase leading-[1.3] tracking-[0.12em] text-text-secondary",
        className
      )}
    >
      {children}
    </h2>
  );
}

export function FieldLabel({ children, className }: TextProps) {
  return (
    <label
      className={cn(
        "block text-[0.8125rem] font-semibold leading-[1.25] text-ink",
        className
      )}
    >
      {children}
    </label>
  );
}

export function HintText({ children, className }: TextProps) {
  return (
    <p
      className={cn(
        "text-[0.75rem] font-normal leading-[1.35] text-text-muted",
        className
      )}
    >
      {children}
    </p>
  );
}

export function BodyText({ children, className }: TextProps) {
  return (
    <p className={cn("text-[0.9375rem] leading-[1.48] text-ink", className)}>
      {children}
    </p>
  );
}

export function MonoText({ children, className, title }: TextProps) {
  return (
    <span
      title={title}
      className={cn(
        "font-[family-name:var(--font-mono)] text-[0.8125rem] leading-[1.45] text-text-secondary",
        className
      )}
    >
      {children}
    </span>
  );
}
