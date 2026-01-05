import { X, Download } from 'lucide-react';
import { useState, useEffect } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Button } from '@/components/ui/button';

// Detect mobile device
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || (window.innerWidth <= 768);
}

export function PWAInstallBanner() {
  const { isInstallable, isInstalled, promptInstall } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);

  // Don't show if already installed, not installable, dismissed, or on desktop
  if (isInstalled || !isInstallable || dismissed || !isMobile) {
    return null;
  }

  const handleInstall = async () => {
    const success = await promptInstall();
    if (!success) {
      // User declined, hide banner
      setDismissed(true);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-4 shadow-lg z-50 safe-area-bottom">
      <div className="flex items-center justify-between max-w-lg mx-auto">
        <div className="flex items-center gap-3 flex-1">
          <div className="bg-white/20 p-2 rounded-lg">
            <Download className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-sm">Install Stocker AI</p>
            <p className="text-xs text-white/80">Add to home screen for quick access</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleInstall}
            size="sm"
            className="bg-white text-emerald-700 hover:bg-white/90 font-semibold"
          >
            Install
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
