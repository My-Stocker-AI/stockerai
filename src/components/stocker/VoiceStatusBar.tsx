import { ZoneLabel } from "./ZoneLabel";
import { StatusDot } from "./StatusDot";
import { Pause, Square, Play } from "lucide-react";
import type { VoiceStatus } from "@/types/stocker";
import { cn } from "@/lib/utils";

interface VoiceStatusBarProps {
  status: VoiceStatus;
  lastInput: string;
  showControls?: boolean;
  isPaused?: boolean;
  onPause: () => void;
  onStop: () => void;
  onResume?: () => void;
}

const statusLabels: Record<VoiceStatus, string> = {
  idle: 'Ready',
  listening: 'Listening...',
  speaking: 'Speaking...',
  thinking: 'Processing...',
  paused: 'Paused',
  error: 'Error',
};

export function VoiceStatusBar({
  status,
  lastInput,
  showControls = true,
  isPaused = false,
  onPause,
  onStop,
  onResume,
}: VoiceStatusBarProps) {
  return (
    <div className="mx-4 mt-3 p-4 rounded-xl glass zone-mic border border-zone-mic/30">
      <div className="flex items-center gap-3">
        <ZoneLabel type="mic">Mic</ZoneLabel>
        
        <StatusDot status={status} size="md" />
        
        <span className="text-sm text-muted-foreground flex-shrink-0">
          {statusLabels[status]}
        </span>
        
        {/* Last input - pushed to right */}
        {lastInput && (
          <span className="text-sm text-speaking flex-1 text-right truncate ml-2">
            "{lastInput}"
          </span>
        )}
        
        {/* Controls */}
        {showControls && (
          <div className="flex gap-2 ml-auto">
            {isPaused ? (
              <button
                onClick={onResume}
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  "bg-secondary hover:bg-secondary/80 transition-all",
                  "text-foreground hover:scale-105 active:scale-95"
                )}
                aria-label="Resume"
              >
                <Play className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={onPause}
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  "bg-secondary hover:bg-secondary/80 transition-all",
                  "text-muted-foreground hover:text-foreground hover:scale-105 active:scale-95"
                )}
                aria-label="Pause"
              >
                <Pause className="w-5 h-5" />
              </button>
            )}
            
            <button
              onClick={onStop}
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center",
                "bg-secondary hover:bg-destructive/20 transition-all",
                "text-destructive hover:scale-105 active:scale-95"
              )}
              aria-label="Stop"
            >
              <Square className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
