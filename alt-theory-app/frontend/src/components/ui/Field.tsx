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

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("ui-field", className)} {...props} />;
}

export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn("ui-field min-h-24 resize-y", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("ui-field", className)} {...props} />;
}
