import { X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsSheet({ isOpen, onClose }: SettingsSheetProps) {
  const [callTwoItems, setCallTwoItems] = useState(false);
  const [ttsVolume, setTtsVolume] = useState(1.5); // Default 150%

  // Load preferences from localStorage on mount
  useEffect(() => {
    const savedTwoItems = localStorage.getItem('stocker-call-two-items');
    if (savedTwoItems !== null) {
      setCallTwoItems(savedTwoItems === 'true');
    }

    const savedVolume = localStorage.getItem('stocker-tts-volume');
    if (savedVolume !== null) {
      setTtsVolume(parseFloat(savedVolume));
    }
  }, []);

  // Save preference to localStorage when changed
  const handleToggle = (enabled: boolean) => {
    setCallTwoItems(enabled);
    localStorage.setItem('stocker-call-two-items', enabled.toString());
    console.log('[Settings] Call two items:', enabled);
  };

  const handleVolumeChange = (value: number) => {
    setTtsVolume(value);
    localStorage.setItem('stocker-tts-volume', value.toString());
    console.log('[Settings] TTS volume:', value);
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

          {/* Voice Volume Control */}
          <div className="bg-[#0d1117] rounded-xl p-4 border border-gray-800">
            <div className="mb-3">
              <h3 className="text-white font-semibold mb-1">Voice Volume</h3>
              <p className="text-sm text-gray-400">
                Adjust how loud the AI voice speaks. Use this if speakerphone volume buttons aren't working.
              </p>
            </div>

            {/* Volume Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Quiet</span>
                <span className="text-teal-400 font-semibold">{Math.round(ttsVolume * 100)}%</span>
                <span className="text-gray-400">Loud</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.1"
                value={ttsVolume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
              />
              <div className="text-xs text-gray-500 text-center">
                {ttsVolume < 1 ? 'Quieter than normal' : ttsVolume === 1 ? 'Normal volume' : 'Louder than normal'}
              </div>
            </div>
          </div>
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
