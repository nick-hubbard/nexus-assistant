import { LoaderCircle, Send, Wifi, WifiOff } from "lucide-react";
import { type ComponentPropsWithoutRef, forwardRef, type ReactNode } from "react";
import { cn } from "../lib/utils";

export function Button({ className, children, ...props }: ComponentPropsWithoutRef<"button">) {
  return (
    <button className={cn("nexus-button", className)} {...props}>
      {children}
    </button>
  );
}

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentPropsWithoutRef<"textarea">>(
  function Textarea({ className, ...props }, ref) {
    return <textarea className={cn("nexus-textarea", className)} ref={ref} {...props} />;
  },
);

export function Panel({ className, children, ...props }: ComponentPropsWithoutRef<"section">) {
  return (
    <section className={cn("nexus-panel", className)} {...props}>
      {children}
    </section>
  );
}

interface StatusBadgeProps {
  connected: boolean;
  className?: string;
}

export function StatusBadge({ connected, className }: StatusBadgeProps) {
  const Icon = connected ? Wifi : WifiOff;

  return (
    <span
      className={cn(
        "nexus-status-badge",
        connected ? "is-connected" : "is-disconnected",
        className,
      )}
    >
      <Icon aria-hidden="true" size={16} />
      {connected ? "Connected" : "Disconnected"}
    </span>
  );
}

export function SendingIcon() {
  return <LoaderCircle aria-hidden="true" className="nexus-spin" size={16} />;
}

export function SendIcon() {
  return <Send aria-hidden="true" size={16} />;
}

export function VisuallyMuted({ children }: { children: ReactNode }) {
  return <span className="nexus-muted">{children}</span>;
}
