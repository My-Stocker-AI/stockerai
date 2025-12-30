import { ZoneLabel } from "./ZoneLabel";
import { LogOut } from "lucide-react";
import type { RouteState } from "@/types/stocker";

interface RouteHeaderProps {
  routeState: RouteState;
  userName?: string;
  onLogout: () => void;
}

export function RouteHeader({ routeState, userName, onLogout }: RouteHeaderProps) {
  const displayName = routeState.routeName 
    ? `${routeState.routeName} Route`
    : userName 
    ? `Hi, ${userName}` 
    : 'StockerAI';
    
  const progress = routeState.routeName 
    ? `Machine ${routeState.currentMachineIndex}/${routeState.totalMachines}`
    : null;

  return (
    <header className="flex items-center justify-between px-5 py-3 pt-[max(12px,env(safe-area-inset-top))] glass border-b border-zone-route/30">
      <div className="flex items-center gap-3">
        <ZoneLabel type="route">Route</ZoneLabel>
        <h1 className="text-base font-semibold text-primary truncate max-w-[160px]">
          {displayName}
        </h1>
      </div>
      
      <div className="flex items-center gap-3">
        {progress && (
          <span className="text-sm text-muted-foreground bg-secondary/80 px-3 py-1 rounded-full">
            {progress}
          </span>
        )}
        <button
          onClick={onLogout}
          className="text-muted-foreground hover:text-foreground transition-colors p-1.5"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
