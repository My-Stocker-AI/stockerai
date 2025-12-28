import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface OfflineBannerProps {
  isVisible: boolean;
}

export function OfflineBanner({ isVisible }: OfflineBannerProps) {
  if (!isVisible) return null;
  
  return (
    <div className={cn(
      "fixed top-0 left-0 right-0 z-50",
      "pt-[max(8px,env(safe-area-inset-top))] pb-2 px-4",
      "bg-amber-500 text-amber-950",
      "flex items-center justify-center gap-2",
      "font-semibold text-sm",
      "animate-slide-in"
    )}>
      <WifiOff className="w-4 h-4" />
      No internet connection
    </div>
  );
}
