import { ZoneLabel } from "./ZoneLabel";
import { CheckCircle2, ChevronRight } from "lucide-react";
import type { RouteItem } from "@/types/stocker";
import { cn } from "@/lib/utils";

interface CurrentItemCardProps {
  item: RouteItem | null;
  machineName: string | null;
  isRouteComplete?: boolean;
}

export function CurrentItemCard({ item, machineName, isRouteComplete }: CurrentItemCardProps) {
  if (isRouteComplete) {
    return (
      <div className="relative mx-4 mt-3 p-6 rounded-xl glass zone-pick animate-fade-in">
        <ZoneLabel type="pick" className="absolute top-3 right-3">Pick Item</ZoneLabel>
        
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mb-4 glow-primary">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <p className="text-xl font-semibold text-primary">Route Complete!</p>
          <p className="text-sm text-muted-foreground mt-1">Great work</p>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="relative mx-4 mt-3 p-6 rounded-xl glass border border-border/50 animate-fade-in">
        <ZoneLabel type="pick" className="absolute top-3 right-3">Pick Item</ZoneLabel>
        
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <img src="/logo.svg" alt="Stocker AI" className="w-10 h-10" />
          </div>
          <p className="text-lg text-muted-foreground">Say "start my route" to begin</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-4 mt-3 p-5 rounded-xl glass zone-pick border border-zone-pick/40 animate-slide-in shadow-[0_0_40px_-10px_hsl(var(--zone-pick)/0.4)]">
      <ZoneLabel type="pick" className="absolute top-3 right-3">Pick Item</ZoneLabel>
      
      <div className="flex items-start gap-4">
        {/* Visual indicator */}
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
          <ChevronRight className="w-6 h-6 text-primary" />
        </div>
        
        {/* Item details - Large for visibility */}
        <div className="flex-1 min-w-0">
          {/* Quantity and Product - Main focus */}
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-3xl font-bold text-primary tabular-nums">
              {item.quantity}×
            </span>
            <span className="text-2xl font-semibold text-foreground truncate">
              {item.product}
            </span>
          </div>
          
          {/* Slot - Secondary but important */}
          <p className="text-xl font-medium text-primary">
            {item.slot_spoken || item.slot}
          </p>
          
          {/* Machine - Tertiary info */}
          {machineName && (
            <p className="text-sm text-muted-foreground mt-2 truncate">
              {machineName}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
