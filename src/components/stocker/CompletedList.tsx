import { ZoneLabel } from "./ZoneLabel";
import { Check } from "lucide-react";
import type { RouteItem } from "@/types/stocker";
import { cn } from "@/lib/utils";

interface CompletedListProps {
  items: RouteItem[];
}

export function CompletedList({ items }: CompletedListProps) {
  return (
    <div className="mx-4 mt-3 flex-1 overflow-hidden flex flex-col rounded-xl glass zone-done border border-zone-done/20">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 px-4 py-2 bg-card/95 backdrop-blur-sm border-b border-border/30">
        <ZoneLabel type="done">Done</ZoneLabel>
        {items.length > 0 && (
          <span className="ml-2 text-xs text-muted-foreground">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      
      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">No items picked yet</p>
          </div>
        ) : (
          <div className="space-y-1 pt-2">
            {items.map((item, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-center gap-3 py-2.5 px-2 rounded-lg",
                  "border-b border-border/20 last:border-b-0",
                  "animate-slide-in"
                )}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-primary" />
                </div>
                
                <span className="text-sm text-muted-foreground tabular-nums w-8">
                  {item.quantity}×
                </span>
                
                <span className="text-sm text-muted-foreground flex-1 truncate">
                  {item.product}
                </span>
                
                <span className="text-xs text-muted-foreground/60">
                  {item.slot}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
