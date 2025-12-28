import { cn } from "@/lib/utils";

type ZoneType = 'route' | 'pick' | 'mic' | 'ai' | 'done';

interface ZoneLabelProps {
  type: ZoneType;
  children: React.ReactNode;
  className?: string;
}

const zoneStyles: Record<ZoneType, string> = {
  route: "bg-zone-route/20 text-zone-route",
  pick: "bg-zone-pick/20 text-zone-pick",
  mic: "bg-zone-mic/20 text-zone-mic",
  ai: "bg-zone-ai/20 text-zone-ai",
  done: "bg-zone-done/20 text-zone-done",
};

export function ZoneLabel({ type, children, className }: ZoneLabelProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase",
        zoneStyles[type],
        className
      )}
    >
      {children}
    </span>
  );
}
