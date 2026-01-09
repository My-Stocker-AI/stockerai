import { X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsSheet({ isOpen, onClose }: SettingsSheetProps) {
  const [callTwoItems, setCallTwoItems] = useState(false);

  // Load preference from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('stocker-call-two-items');
    if (saved !== null) {
      setCallTwoItems(saved === 'true');
    }
  }, []);

  // Save preference to localStorage when changed
  const handleToggle = (enabled: boolean) => {
    setCallTwoItems(enabled);
    localStorage.setItem('stocker-call-two-items', enabled.toString());
    console.log('[Settings] Call two items:', enabled);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center sm:justify-center">
      <div className="bg-[#161b22] rounded-t-3xl sm:rounded-3xl border-t sm:border border-gray-800 p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-500/20 rounded-lg">
              <Zap className="h-6 w-6 text-teal-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Settings</h2>
              <p className="text-sm text-gray-400">Customize your picking experience</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5 text-gray-400" />
          </Button>
        </div>

        {/* Settings */}
        <div className="space-y-6">
          {/* 2-Pick Toggle */}
          <div className="bg-[#0d1117] rounded-xl p-4 border border-gray-800">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-1">Call 2 Items at Once</h3>
                <p className="text-sm text-gray-400">
                  When enabled, the AI will call out two items together instead of one at a time.
                  Example: "5 Snickers, 3 Coca-Cola" instead of just "5 Snickers"
                </p>
              </div>

              {/* Toggle Switch */}
              <button
                onClick={() => handleToggle(!callTwoItems)}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0
                  ${callTwoItems ? 'bg-teal-500' : 'bg-gray-700'}
                `}
              >
                <span
                  className={`
                    inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${callTwoItems ? 'translate-x-6' : 'translate-x-1'}
                  `}
                />
              </button>
            </div>

            {/* Status indicator */}
            <div className="mt-3 text-xs text-gray-500">
              Status: <span className={callTwoItems ? 'text-teal-400' : 'text-gray-400'}>
                {callTwoItems ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          {/* More settings can be added here in the future */}
        </div>

        {/* Close Button */}
        <Button
          onClick={onClose}
          className="w-full mt-6 bg-teal-600 hover:bg-teal-700"
        >
          Done
        </Button>
      </div>
    </div>
  );
}
