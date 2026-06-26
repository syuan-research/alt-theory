import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  items: TabItem[];
  defaultValue?: string;
  className?: string;
  onValueChange?: (value: string) => void;
}

export function Tabs({ items, defaultValue, className, onValueChange }: TabsProps) {
  const initial = defaultValue ?? items[0]?.value;

  return (
    <TabsPrimitive.Root
      defaultValue={initial}
      className={cn("flex min-h-0 flex-1 flex-col", className)}
      onValueChange={onValueChange}
    >
      <TabsPrimitive.List className="flex gap-1 px-2 py-2">
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.value}
            value={item.value}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-[0.75rem] font-medium text-text-secondary transition-colors",
              "data-[state=active]:bg-surface data-[state=active]:text-ink",
              "hover:bg-hover"
            )}
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content
          key={item.value}
          value={item.value}
          className="min-h-0 flex-1 overflow-auto px-3 pb-3 pt-2 outline-none"
        >
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
