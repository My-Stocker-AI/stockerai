import { Mic, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

type TabType = 'voice' | 'upload';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 px-6 bg-card/95 backdrop-blur-xl border-t border-border/50">
      <div className="flex justify-around max-w-md mx-auto">
        <button
          onClick={() => onTabChange('voice')}
          className={cn(
            "flex flex-col items-center gap-1 py-1 px-6 rounded-xl transition-all",
            activeTab === 'voice' 
              ? "text-primary" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
            activeTab === 'voice' && "bg-primary/15"
          )}>
            <Mic className="w-5 h-5" />
          </div>
          <span className="text-xs font-medium">Voice</span>
        </button>
        
        <button
          onClick={() => onTabChange('upload')}
          className={cn(
            "flex flex-col items-center gap-1 py-1 px-6 rounded-xl transition-all",
            activeTab === 'upload' 
              ? "text-primary" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
            activeTab === 'upload' && "bg-primary/15"
          )}>
            <Upload className="w-5 h-5" />
          </div>
          <span className="text-xs font-medium">Upload</span>
        </button>
      </div>
    </nav>
  );
}
