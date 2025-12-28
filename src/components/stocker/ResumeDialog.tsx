import { Button } from "@/components/ui/button";
import { RotateCcw, Play } from "lucide-react";

interface ResumeDialogProps {
  routeName: string;
  machineIndex: number;
  totalMachines: number;
  onResume: () => void;
  onStartFresh: () => void;
}

export function ResumeDialog({ 
  routeName, 
  machineIndex, 
  totalMachines, 
  onResume, 
  onStartFresh 
}: ResumeDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm glass-strong rounded-2xl p-6 text-center animate-scale-in">
        <h2 className="text-xl font-semibold text-primary mb-3">Resume Session?</h2>
        <p className="text-sm text-muted-foreground mb-2">You have an incomplete route:</p>
        <p className="text-base font-semibold text-foreground mb-6">
          {routeName} Route - Machine {machineIndex}/{totalMachines}
        </p>
        
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onStartFresh}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Start Fresh
          </Button>
          <Button
            className="flex-1"
            onClick={onResume}
          >
            <Play className="w-4 h-4 mr-2" />
            Resume
          </Button>
        </div>
      </div>
    </div>
  );
}
