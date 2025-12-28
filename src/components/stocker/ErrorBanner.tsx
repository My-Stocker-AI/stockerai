import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (!message) return null;
  
  return (
    <div className={cn(
      "fixed top-0 left-0 right-0 z-50",
      "pt-[max(12px,env(safe-area-inset-top))] pb-3 px-4",
      "bg-destructive text-destructive-foreground",
      "flex items-center justify-center gap-2",
      "font-medium text-sm",
      "animate-slide-in"
    )}>
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 text-center">{message}</span>
      <button 
        onClick={onDismiss}
        className="p-1 hover:bg-white/20 rounded transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
