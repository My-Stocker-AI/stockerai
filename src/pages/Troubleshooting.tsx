import { ArrowLeft, Smartphone, Chrome, HelpCircle, Mic, Volume2, Wifi } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function Troubleshooting() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0d1117] via-[#161b22] to-[#0d1117] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">Troubleshooting</h1>
        <div className="w-10" /> {/* Spacer */}
      </header>

      <main className="p-6 max-w-4xl mx-auto space-y-8">
        {/* Quick Diagnostic */}
        <section className="bg-[#161b22] rounded-xl border border-gray-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <HelpCircle className="h-6 w-6 text-blue-400" />
            <h2 className="text-xl font-bold">Quick Diagnostic</h2>
          </div>
          <div className="space-y-3">
            <div className="bg-[#0d1117] rounded-lg p-4">
              <p className="text-gray-300 mb-2"><strong className="text-white">Is the mic icon green and pulsing?</strong></p>
              <p className="text-sm text-gray-400">✅ Yes → Voice is active, just speak clearly</p>
              <p className="text-sm text-gray-400">❌ No → See "Microphone Not Working" below</p>
            </div>
            <div className="bg-[#0d1117] rounded-lg p-4">
              <p className="text-gray-300 mb-2"><strong className="text-white">Can you hear Stocker AI speaking?</strong></p>
              <p className="text-sm text-gray-400">✅ Yes → Audio is working</p>
              <p className="text-sm text-gray-400">❌ No → See "No Audio" below</p>
            </div>
            <div className="bg-[#0d1117] rounded-lg p-4">
              <p className="text-gray-300 mb-2"><strong className="text-white">Are you on iPhone/iPad with Safari?</strong></p>
              <p className="text-sm text-gray-400">📱 Yes → See "Safari/iOS Issues" below</p>
              <p className="text-sm text-gray-400">💻 No → See "Chrome/Desktop Issues" below</p>
            </div>
          </div>
        </section>

        {/* Safari/iOS Issues */}
        <section className="bg-[#161b22] rounded-xl border border-gray-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Smartphone className="h-6 w-6 text-teal-400" />
            <h2 className="text-xl font-bold">Safari / iOS Issues</h2>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">Microphone Permission Denied</h3>
              <ol className="list-decimal list-inside space-y-2 text-gray-300">
                <li>Tap the <strong>AA</strong> icon (or padlock) in Safari's address bar</li>
                <li>Tap <strong>"Website Settings"</strong></li>
                <li>Find <strong>"Microphone"</strong> and change to <strong>"Allow"</strong></li>
                <li>Tap <strong>"Done"</strong> and refresh the page</li>
              </ol>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">No Audio Playing</h3>
              <p className="text-gray-300 mb-2">Safari requires a tap before playing audio:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li><strong>Tap any route card</strong> when you first load the app</li>
                <li><strong>Tap the mic icon</strong> if audio stops</li>
                <li>Make sure your phone's <strong>ringer is not on silent</strong></li>
                <li>Check your <strong>volume</strong> (use volume buttons)</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">Voice Recognition Not Working</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li>Speak <strong>clearly and loudly</strong></li>
                <li>Wait for mic icon to turn <strong>green and pulsing</strong></li>
                <li>Make sure you're <strong>not in silent mode</strong></li>
                <li>Check Safari didn't block microphone (see above)</li>
              </ul>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
              <p className="text-sm text-amber-400">
                <strong>iOS Tip:</strong> If the app seems frozen, tap the screen once to "wake" audio, then try voice commands again.
              </p>
            </div>
          </div>
        </section>

        {/* Chrome/Desktop Issues */}
        <section className="bg-[#161b22] rounded-xl border border-gray-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Chrome className="h-6 w-6 text-blue-400" />
            <h2 className="text-xl font-bold">Chrome / Desktop Issues</h2>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">Microphone Permission Denied</h3>
              <ol className="list-decimal list-inside space-y-2 text-gray-300">
                <li>Click the <strong>camera/mic icon</strong> (or padlock) in Chrome's address bar</li>
                <li>Find <strong>"Microphone"</strong> and select <strong>"Allow"</strong></li>
                <li>Refresh the page</li>
                <li><strong>Alternative:</strong> Go to <code className="bg-gray-800 px-2 py-1 rounded text-sm">chrome://settings/content/microphone</code> and allow my-stocker-ai.com</li>
              </ol>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">Wrong Microphone Selected</h3>
              <ol className="list-decimal list-inside space-y-2 text-gray-300">
                <li>Click the mic icon in Chrome's address bar</li>
                <li>Check which microphone is selected</li>
                <li>If wrong, go to <code className="bg-gray-800 px-2 py-1 rounded text-sm">chrome://settings/content/microphone</code></li>
                <li>Select the correct microphone from the dropdown</li>
              </ol>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">No Audio Playing</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li>Check your computer's <strong>volume</strong></li>
                <li>Make sure the browser tab is <strong>not muted</strong> (check tab icon)</li>
                <li>Try clicking anywhere on the page to "unlock" audio</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Common Issues */}
        <section className="bg-[#161b22] rounded-xl border border-gray-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Mic className="h-6 w-6 text-red-400" />
            <h2 className="text-xl font-bold">Common Issues (All Devices)</h2>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">Microphone Not Working</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li>Check if mic icon shows <strong>green and pulsing</strong> (listening)</li>
                <li>If red with MicOff, tap the <strong>"Unmute" button</strong></li>
                <li>If gray, check browser permissions (see above)</li>
                <li>Try saying <strong>"Hey Stocker"</strong> to wake it up</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">Voice Commands Not Recognized</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li><strong>Speak clearly</strong> - don't rush</li>
                <li><strong>One person at a time</strong> - multiple voices confuse it</li>
                <li>Say full route names: <strong>"North Route"</strong> not just "North"</li>
                <li>For confirmation, just say <strong>"next"</strong>, <strong>"done"</strong>, or <strong>"yes"</strong></li>
                <li>Check the Quick Commands help (? icon in header)</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">App Seems Frozen</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li>Check if you have internet connection</li>
                <li>Try saying <strong>"Hey Stocker"</strong></li>
                <li>Tap the <strong>Refresh button</strong> (if visible)</li>
                <li>Refresh the browser page (F5 or pull down on mobile)</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">Route Won't Start</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li>Make sure PDF was uploaded successfully</li>
                <li>Say the <strong>full route name</strong> ("North Route")</li>
                <li>Or <strong>tap the route card</strong></li>
                <li>Check you're working on the correct date (today/tomorrow)</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Internet Issues */}
        <section className="bg-[#161b22] rounded-xl border border-gray-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Wifi className="h-6 w-6 text-purple-400" />
            <h2 className="text-xl font-bold">Connection Issues</h2>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">"Connection Lost" Error</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li>Check your <strong>WiFi or cellular connection</strong></li>
                <li>Try refreshing the page</li>
                <li>Close and reopen the browser</li>
                <li>If on weak WiFi, switch to cellular data</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">"Service is busy" Error</h3>
              <p className="text-gray-300 mb-2">This means the AI service hit rate limits:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li>Wait <strong>30 seconds</strong> and try again</li>
                <li>Don't spam commands rapidly</li>
                <li>This is temporary - service will recover</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Still Having Issues */}
        <section className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6">
          <h2 className="text-xl font-bold text-emerald-400 mb-3">Still Having Issues?</h2>
          <p className="text-gray-300 mb-4">
            If none of these solutions work, please contact support with:
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-300 mb-4">
            <li>What device you're using (iPhone, Android, Mac, PC)</li>
            <li>What browser (Safari, Chrome)</li>
            <li>What you were trying to do when the problem occurred</li>
            <li>Any error messages you saw</li>
          </ul>
          <Button
            onClick={() => window.location.href = 'mailto:support@my-stocker-ai.com?subject=Stocker%20AI%20Support%20Request'}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Email Support
          </Button>
        </section>

        {/* Back Button */}
        <div className="text-center pb-8">
          <Button
            onClick={() => navigate(-1)}
            variant="outline"
            className="w-full max-w-sm"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to App
          </Button>
        </div>
      </main>
    </div>
  );
}
