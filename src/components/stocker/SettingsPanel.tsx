import { Volume2 } from 'lucide-react';
import { useDriverSettings, EnvironmentType } from '@/hooks/useDriverSettings';

/**
 * SettingsPanel — the ONE set of driver controls (2-Pick, Voice Volume, Environment).
 *
 * Rendered from both the dashboard Settings page and the in-route gear sheet. It owns
 * no persistence logic itself — it reads and writes through useDriverSettings, which
 * keeps localStorage and the driver's account record in sync. Mount it anywhere; it
 * just works.
 */

const ENV_OPTIONS: { value: Exclude<EnvironmentType, 'unknown'>; emoji: string; label: string; active: string }[] = [
  { value: 'quiet', emoji: '🏡', label: 'Quiet', active: 'bg-green-500/30 text-green-300 border-2 border-green-400 shadow-[0_0_20px_rgba(34,197,94,0.4)] scale-105' },
  { value: 'moderate', emoji: '🏢', label: 'Moderate', active: 'bg-yellow-500/30 text-yellow-300 border-2 border-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.4)] scale-105' },
  { value: 'loud', emoji: '🏭', label: 'Loud', active: 'bg-orange-500/30 text-orange-300 border-2 border-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.4)] scale-105' },
];

export function SettingsPanel() {
  const { settings, setTtsVolume, setCallTwoItems, setEnvironmentType } = useDriverSettings();
  const { ttsVolume, callTwoItems, environmentType } = settings;

  return (
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
          <button
            type="button"
            aria-label="Toggle call two items"
            onClick={() => setCallTwoItems(!callTwoItems)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
              callTwoItems ? 'bg-teal-500' : 'bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                callTwoItems ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
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
            onChange={(e) => setTtsVolume(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
          />
          <div className="text-xs text-gray-500 text-center">
            {ttsVolume < 1 ? 'Quieter than normal' : ttsVolume === 1 ? 'Normal volume' : 'Louder than normal'}
          </div>
        </div>
      </div>

      {/* Environment Type */}
      <div className="bg-[#0d1117] rounded-xl p-4 border border-gray-800">
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <Volume2 className="h-4 w-4 text-teal-400" />
            <h3 className="text-white font-semibold">Environment Type</h3>
          </div>
          <p className="text-sm text-gray-400">
            Tune voice recognition for where you're picking. Improves accuracy in noisy warehouses.
          </p>
        </div>

        <div className="mb-3 p-3 bg-gray-800/50 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Current:</span>
            <span className={`text-sm font-semibold ${
              environmentType === 'quiet' ? 'text-green-400' :
              environmentType === 'moderate' ? 'text-yellow-400' :
              environmentType === 'loud' ? 'text-orange-400' :
              'text-gray-400'
            }`}>
              {environmentType === 'quiet' && '🏡 Quiet (Garage, Small Room)'}
              {environmentType === 'moderate' && '🏢 Moderate (Office, Small Warehouse)'}
              {environmentType === 'loud' && '🏭 Loud (Large Warehouse, Factory)'}
              {environmentType === 'unknown' && '❓ Not Set'}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-gray-500">Choose your environment:</p>
          <div className="grid grid-cols-3 gap-2">
            {ENV_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setEnvironmentType(opt.value)}
                className={`p-3 rounded-lg text-sm font-bold transition-all ${
                  environmentType === opt.value
                    ? opt.active
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                }`}
              >
                {opt.emoji}<br />{opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 p-2 bg-gray-800/30 rounded text-xs text-gray-500">
          💡 Set this before starting a route. It takes effect when a route begins or resumes — never mid-pick.
        </div>
      </div>
    </div>
  );
}
