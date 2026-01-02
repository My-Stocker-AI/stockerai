import { useState } from 'react';
import { ChevronDown, ChevronUp, Check, Play, Pause, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MachineState, MachineStatus } from '@/hooks/useStockerSession';

interface MachineListPanelProps {
  machines: MachineState[];
  currentMachineId: string | null;
  onMachineSelect?: (machineId: string) => void;
  onSkipMachine?: () => void;
}

const statusConfig: Record<MachineStatus, { icon: typeof Check; color: string; bgColor: string; label: string }> = {
  pending: { icon: Circle, color: 'text-gray-400', bgColor: 'bg-gray-800', label: 'Pending' },
  in_progress: { icon: Play, color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', label: 'In Progress' },
  completed: { icon: Check, color: 'text-green-400', bgColor: 'bg-green-500/20', label: 'Complete' },
  skipped: { icon: Pause, color: 'text-orange-400', bgColor: 'bg-orange-500/20', label: 'Skipped' }
};

export function MachineListPanel({
  machines,
  currentMachineId,
  onMachineSelect,
  onSkipMachine
}: MachineListPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const completedCount = machines.filter(m => m.status === 'completed').length;
  const skippedCount = machines.filter(m => m.status === 'skipped').length;

  if (machines.length === 0) return null;

  return (
    <div className="bg-[#161b22] rounded-xl border border-gray-800 overflow-hidden">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 font-semibold uppercase">Machines</span>
          <span className="text-xs text-gray-500">
            {completedCount}/{machines.length}
            {skippedCount > 0 && (
              <span className="text-orange-400 ml-1">({skippedCount} skipped)</span>
            )}
          </span>
        </div>

        {/* Compact status indicators when collapsed */}
        <div className="flex items-center gap-2">
          {!isExpanded && (
            <div className="flex items-center gap-1">
              {machines.map((machine) => {
                const config = statusConfig[machine.status];
                const Icon = config.icon;
                return (
                  <div
                    key={machine.id}
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center",
                      config.bgColor,
                      machine.id === currentMachineId && "ring-2 ring-emerald-400"
                    )}
                    title={`${machine.name}: ${config.label}`}
                  >
                    <Icon className={cn("h-3 w-3", config.color)} />
                  </div>
                );
              })}
            </div>
          )}
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded list */}
      {isExpanded && (
        <div className="border-t border-gray-800">
          {machines.map((machine) => {
            const config = statusConfig[machine.status];
            const Icon = config.icon;
            const isCurrent = machine.id === currentMachineId;
            const canTap = machine.status === 'skipped' ||
                          (machine.status === 'pending' && onMachineSelect);

            return (
              <div
                key={machine.id}
                onClick={() => canTap && onMachineSelect?.(machine.id)}
                className={cn(
                  "px-4 py-3 flex items-center gap-3 border-b border-gray-800/50 last:border-b-0",
                  isCurrent && "bg-emerald-500/10",
                  canTap && "cursor-pointer hover:bg-gray-800/50",
                  machine.status === 'completed' && "opacity-60"
                )}
              >
                {/* Status icon */}
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                  config.bgColor
                )}>
                  <Icon className={cn("h-4 w-4", config.color)} />
                </div>

                {/* Machine info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-medium truncate",
                      isCurrent ? "text-white" : "text-gray-300"
                    )}>
                      {machine.name}
                    </span>
                    {isCurrent && (
                      <span className="text-xs text-emerald-400 font-medium">CURRENT</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {machine.location}
                  </div>
                </div>

                {/* Progress */}
                <div className="text-right flex-shrink-0">
                  <div className={cn(
                    "text-sm font-medium",
                    machine.status === 'completed' ? "text-green-400" :
                    machine.status === 'skipped' ? "text-orange-400" :
                    "text-gray-400"
                  )}>
                    {machine.completedItems}/{machine.totalItems}
                  </div>
                  {machine.status === 'skipped' && (
                    <div className="text-xs text-orange-400">
                      Tap to return
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Skip button for current machine */}
          {onSkipMachine && currentMachineId && (
            <div className="p-3 border-t border-gray-800">
              <button
                onClick={onSkipMachine}
                className="w-full py-2 px-4 text-sm text-orange-400 border border-orange-500/30 rounded-lg hover:bg-orange-500/10 transition-colors"
              >
                Skip Current Machine
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
