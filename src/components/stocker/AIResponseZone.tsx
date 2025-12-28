import { ZoneLabel } from "./ZoneLabel";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AIResponseZoneProps {
  response: string;
  isEmpty?: boolean;
}

export function AIResponseZone({ response, isEmpty }: AIResponseZoneProps) {
  return (
    <div className="mx-4 mt-3 p-4 rounded-xl glass zone-ai border border-zone-ai/30 min-h-[72px]">
      <div className="flex items-start gap-3">
        <ZoneLabel type="ai">AI Says</ZoneLabel>
        
        <div className="flex-1 flex items-start gap-2">
          {!isEmpty && (
            <Sparkles className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
          )}
          <p className={cn(
            "text-base leading-relaxed flex-1",
            isEmpty ? "text-muted-foreground italic" : "text-foreground"
          )}>
            {response}
          </p>
        </div>
      </div>
    </div>
  );
}
