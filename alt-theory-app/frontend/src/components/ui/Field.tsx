import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { FieldLabel, HintText } from "./Typography";

interface FieldFrameProps {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function FieldFrame({ label, hint, children, className }: FieldFrameProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <FieldLabel>{label}</FieldLabel>
      {children}
      {hint ? <HintText>{hint}</HintText> : null}
    </div>
  );
}

const controlClasses =
  "w-full rounded-md border border-transparent bg-surface px-2.5 py-2 text-[0.9375rem] text-ink outline-none transition-colors placeholder:text-text-muted/85 focus:border-ink-soft disabled:cursor-not-allowed disabled:text-text-muted";

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClasses, className)} {...props} />;
}

export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(controlClasses, "min-h-24 resize-y", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClasses, "py-1.5", className)} {...props} />;
}
