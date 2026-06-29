import { X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsPanel } from '@/components/stocker/SettingsPanel';

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * SettingsSheet — the in-route gear sheet. Just a bottom-sheet shell around the one
 * shared SettingsPanel, so the in-route controls are identical to the dashboard's and
 * persist the same way (localStorage + driver account). No duplicated settings logic.
 */
export function SettingsSheet({ isOpen, onClose }: SettingsSheetProps) {
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

        <SettingsPanel />

        <Button onClick={onClose} className="w-full mt-6 bg-teal-600 hover:bg-teal-700">
          Done
        </Button>
      </div>
    </div>
  );
}
