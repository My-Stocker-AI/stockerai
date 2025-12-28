import { cn } from "@/lib/utils";
import type { VoiceStatus } from "@/types/stocker";

interface StatusDotProps {
  status: VoiceStatus;
  size?: 'sm' | 'md' | 'lg';
}

const statusColors: Record<VoiceStatus, string> = {
  idle: "bg-muted-foreground/40",
  listening: "bg-primary",
  speaking: "bg-speaking",
  thinking: "bg-thinking",
  paused: "bg-transparent border-2 border-muted-foreground",
  error: "bg-destructive",
};

const sizeClasses = {
  sm: "w-2 h-2",
  md: "w-3 h-3",
  lg: "w-4 h-4",
};

export function StatusDot({ status, size = 'md' }: StatusDotProps) {
  const isAnimated = status === 'listening' || status === 'thinking';
  
  return (
    <div className="relative flex items-center justify-center">
      {/* Pulse ring for listening state */}
      {status === 'listening' && (
        <span
          className={cn(
            "absolute rounded-full bg-primary/40 animate-pulse-ring",
            sizeClasses[size]
          )}
        />
      )}
      
      {/* Main dot */}
      <span
        className={cn(
          "rounded-full flex-shrink-0 transition-all duration-300",
          sizeClasses[size],
          statusColors[status],
          status === 'listening' && "animate-pulse-dot",
          status === 'thinking' && "animate-thinking"
        )}
      />
      
      {/* Speaking bars */}
      {status === 'speaking' && (
        <div className="absolute flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-0.5 h-2 bg-speaking rounded-full animate-speaking"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
