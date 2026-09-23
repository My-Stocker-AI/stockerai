import { Link } from "react-router-dom";
import Navbar from "@/components/marketing/Navbar";
import Footer from "@/components/marketing/Footer";
import {
  Mic,
  Play,
  ArrowRight,
  SkipForward,
  RotateCcw,
  CheckCircle,
  ArrowUpDown,
  HelpCircle,
  Volume2,
  VolumeX,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Smartphone,
  Upload,
  Wifi,
  RefreshCw,
  Trash2,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/button";

const commandCategories = [
  {
    title: "Starting Your Route",
    icon: Play,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
    commands: [
      { phrase: '"What routes do I have?"', description: "Check available routes for today" },
      { phrase: '"What routes for December 26th?"', description: "Check routes for a specific date" },
      { phrase: '"Start my route"', description: "Begin the available route" },
      { phrase: '"Start the North route"', description: "Start a specific route by name" },
      { phrase: '"Ready" / "Yes" / "Let\'s go"', description: "Confirm and begin stocking" },
    ]
  },
  {
    title: "Pick Direction",
    icon: ArrowUpDown,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    commands: [
      { phrase: '"Top" / "From the top"', description: "Start from the first item in the list" },
      { phrase: '"Bottom" / "From the bottom"', description: "Start from the last item (reverse order)" },
      { phrase: '"Beginning" / "First"', description: "Same as top - start from first item" },
      { phrase: '"End" / "Last" / "Reverse"', description: "Same as bottom - start from last item" },
    ]
  },
  {
    title: "Confirming Items",
    icon: CheckCircle,
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/20",
    commands: [
      { phrase: '"Next" / "Next item"', description: "Move to the next item" },
      { phrase: '"Done" / "Got it"', description: "Confirm you picked the item" },
      { phrase: '"Yes" / "Yep" / "Yeah"', description: "Quick confirmation" },
      { phrase: '"Check" / "Good" / "Perfect"', description: "Confirm and continue" },
      { phrase: '"OK next" / "Alright"', description: "Confirm and get next item" },
    ]
  },
  {
    title: "Skipping & Navigation",
    icon: SkipForward,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20",
    commands: [
      { phrase: '"Skip" / "Skip machine"', description: "Skip current machine, come back later" },
      { phrase: '"Skip this one"', description: "Skip the current machine" },
      { phrase: '"Next machine"', description: "Move to the next machine" },
    ]
  },
  {
    title: "Going Back",
    icon: RotateCcw,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
    commands: [
      { phrase: '"Go back" / "Undo"', description: "Move the on-screen picker to the previous item" },
      { phrase: '"Oops" / "Wrong" / "Mistake"', description: "Move back so you can check the previous pick" },
      { phrase: '"Back to skipped"', description: "Return to a skipped machine" },
      { phrase: '"Previous" / "Back one"', description: "Go back one item" },
    ]
  },
  {
    title: "Microphone Control",
    icon: Mic,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
    commands: [
      { phrase: '"Pause" / "Stop listening"', description: "Pause commands while still listening for the wake phrase" },
      { phrase: '"Mute" / "Mute mic"', description: "Turn microphone sending off; tap Unmute to return" },
      { phrase: 'Say "OK Stocker"', description: "Resume from Pause (Mute requires a tap)" },
    ]
  },
  {
    title: "Questions & Status",
    icon: HelpCircle,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/20",
    commands: [
      { phrase: '"What\'s in the machine?"', description: "Check current inventory level" },
      { phrase: '"How many left?"', description: "Hear the current machine's inventory information" },
      { phrase: '"What machine is this?"', description: "Hear current machine name" },
      { phrase: '"How many machines left?"', description: "Check remaining machines" },
    ]
  },
];

const Guide = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-32 pb-20">
        <div className="container max-w-6xl mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Volume2 className="h-4 w-4" />
              Voice Commands Reference
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Quick Start Guide
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Everything you can say to Stocker AI. Just speak naturally -
              the AI understands variations and conversational phrases.
            </p>
          </div>

          {/* Quick Jump Links */}
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            <a href="#iphone-setup" className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-full text-sm font-medium hover:bg-gray-800 transition-colors">
              🍎 iPhone Setup
            </a>
            <a href="#android-setup" className="inline-flex items-center gap-2 px-4 py-2 bg-green-800 text-white rounded-full text-sm font-medium hover:bg-green-700 transition-colors">
              🤖 Android Setup
            </a>
            <a href="#computer-setup" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/90 transition-colors">
              💻 Computer Setup
            </a>
            <a href="#troubleshooting" className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-full text-sm font-medium hover:bg-yellow-500 transition-colors">
              ⚠️ Troubleshooting
            </a>
          </div>

          {/* Pro Tips Banner */}
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 mb-12">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <Mic className="h-5 w-5 text-primary" />
              Pro Tips
            </h3>
            <ul className="grid md:grid-cols-2 gap-3 text-muted-foreground">
              <li className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-primary mt-1 shrink-0" />
                <span>Speak naturally - you don't need exact phrases</span>
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-primary mt-1 shrink-0" />
                <span>Say "next" or "got it" to move through items quickly</span>
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-primary mt-1 shrink-0" />
                <span>Skip machines you can't access - come back later</span>
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-primary mt-1 shrink-0" />
                <span>Say "oops" or "undo" if you confirmed by mistake</span>
              </li>
            </ul>
          </div>

          {/* Command Categories Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-16">
            {commandCategories.map((category) => {
              const Icon = category.icon;
              return (
                <div
                  key={category.title}
                  className={`rounded-2xl border ${category.borderColor} ${category.bgColor} p-6`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 rounded-lg ${category.bgColor}`}>
                      <Icon className={`h-5 w-5 ${category.color}`} />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {category.title}
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {category.commands.map((cmd, idx) => (
                      <div key={idx} className="flex flex-col">
                        <code className="text-sm font-medium text-foreground bg-background/50 px-2 py-1 rounded w-fit">
                          {cmd.phrase}
                        </code>
                        <span className="text-sm text-muted-foreground mt-1 ml-2">
                          {cmd.description}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* CRITICAL DO'S AND DON'TS */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-foreground mb-8 text-center">
              Do's and Don'ts
            </h2>
            <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
              Read this carefully before using Stocker AI. Following these rules will save you time and frustration.
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              {/* DO's */}
              <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  </div>
                  <h3 className="text-xl font-bold text-green-500">DO</h3>
                </div>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <strong className="text-foreground">Speak clearly and wait for the beep</strong>
                      <p className="text-sm text-muted-foreground mt-1">After Stocker speaks, wait for the listening indicator before talking</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <strong className="text-foreground">Keep Stocker in the foreground while picking</strong>
                      <p className="text-sm text-muted-foreground mt-1">Stocker requests a screen wake lock, but phone settings can still interrupt it. If the screen locks, reopen Stocker and use Continue.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <strong className="text-foreground">Use ONE person per microphone</strong>
                      <p className="text-sm text-muted-foreground mt-1">Multiple voices confuse the AI. One worker = one device.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <strong className="text-foreground">Check the route before replacing it</strong>
                      <p className="text-sm text-muted-foreground mt-1">Uploading the same driver, route name, and date replaces that route. Do not replace a route while someone is picking it.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <strong className="text-foreground">Stay connected to WiFi or mobile data</strong>
                      <p className="text-sm text-muted-foreground mt-1">Stocker needs internet to work. No offline mode.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <strong className="text-foreground">Say "skip machine" clearly for skipping</strong>
                      <p className="text-sm text-muted-foreground mt-1">A clear skip command can move immediately. Check the machine name on screen before speaking it.</p>
                    </div>
                  </li>
                </ul>
              </div>

              {/* DON'Ts */}
              <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-red-500/10">
                    <XCircle className="h-6 w-6 text-red-500" />
                  </div>
                  <h3 className="text-xl font-bold text-red-500">DON'T</h3>
                </div>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <strong className="text-foreground">Don't mumble or rush your words</strong>
                      <p className="text-sm text-muted-foreground mt-1">Garbled speech can trigger wrong actions. Speak at normal pace.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <strong className="text-foreground">Don't have background noise or music</strong>
                      <p className="text-sm text-muted-foreground mt-1">Turn off radios, TVs, or loud machinery near the mic.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <strong className="text-foreground">Don't replace a route being picked</strong>
                      <p className="text-sm text-muted-foreground mt-1">A matching upload replaces the existing route and its work. Wait until active picking is finished.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <strong className="text-foreground">Don't share accounts between workers</strong>
                      <p className="text-sm text-muted-foreground mt-1">Each worker needs their own login. Sessions get confused otherwise.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <strong className="text-foreground">Don't use old bookmarks or cached sites</strong>
                      <p className="text-sm text-muted-foreground mt-1">Use stocker-ai.com. Refresh or reopen the installed app after an update.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <strong className="text-foreground">Don't interrupt while Stocker is speaking</strong>
                      <p className="text-sm text-muted-foreground mt-1">Wait for it to finish. The mic icon shows when it's listening.</p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* UPLOADING ROUTES SECTION */}
          <div className="bg-card border border-border rounded-2xl p-8 mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-primary/10">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">
                Uploading Routes - Step by Step
              </h2>
            </div>

            <div className="space-y-6">
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 shrink-0" />
                  <div>
                    <strong className="text-foreground">Matching uploads replace the existing route</strong>
                    <p className="text-sm text-muted-foreground mt-1">
                      A report with the same assigned driver, route name, and delivery date replaces
                      the earlier copy. Never do this while that route is being picked.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-foreground mb-3">To Upload a New Route:</h4>
                  <ol className="space-y-3 text-muted-foreground">
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">1</span>
                      <span>Go to Dashboard → Upload Routes</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">2</span>
                      <span>Select the vending system, driver, delivery date, and PDF report</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">3</span>
                      <span>Wait for processing (may take 30-60 seconds)</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">4</span>
                      <span>Verify the route appears in My Routes</span>
                    </li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-semibold text-foreground mb-3">To Replace an Existing Route:</h4>
                  <ol className="space-y-3 text-muted-foreground">
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-red-500/10 text-red-500 text-sm font-bold flex items-center justify-center shrink-0">1</span>
                      <span>Confirm nobody is actively picking the existing route</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-red-500/10 text-red-500 text-sm font-bold flex items-center justify-center shrink-0">2</span>
                      <span>Go to Dashboard → Upload Routes</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-red-500/10 text-red-500 text-sm font-bold flex items-center justify-center shrink-0">3</span>
                      <span>Choose the same driver, route date, and vending system</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">4</span>
                      <span>Upload the corrected report and verify it in My Routes</span>
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          {/* TROUBLESHOOTING SECTION */}
          <div id="troubleshooting" className="mb-16">
            <h2 className="text-3xl font-bold text-foreground mb-8 text-center">
              Troubleshooting
            </h2>
            <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
              Having problems? Find your issue below for the fix.
            </p>

            <div className="space-y-4">
              {/* Problem 1 */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  "Can't find your route" when I know I uploaded it
                </h4>
                <div className="ml-7 space-y-2 text-muted-foreground">
                  <p><strong>Possible causes:</strong> The route has a different scheduled date, is assigned to another driver, the account session is stale, or loading failed.</p>
                  <p><strong>Fix:</strong> Check My Routes, including Earlier Scheduled Routes. Refresh once. An administrator can confirm the assigned driver; if a load error appears, follow its connection instructions.</p>
                </div>
              </div>

              {/* Problem 2 */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  A route upload fails
                </h4>
                <div className="ml-7 space-y-2 text-muted-foreground">
                  <p><strong>Fix:</strong> Read the red message. Check your connection, sign in again if the session expired, and confirm the vending system and PDF. A failed upload says whether the route was added; do not repeatedly submit while the first upload is still processing.</p>
                </div>
              </div>

              {/* Problem 3 */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Stocker says "skip machine" when I said "next"
                </h4>
                <div className="ml-7 space-y-2 text-muted-foreground">
                  <p><strong>Possible causes:</strong> Garbled audio, another voice, or background noise.</p>
                  <p><strong>Fix:</strong> Check the current machine on screen and use the touch controls if needed. A clear skip command may act immediately, so do not rely on a confirmation question.</p>
                </div>
              </div>

              {/* Problem 4 */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Login page looks wrong or shows old version
                </h4>
                <div className="ml-7 space-y-2 text-muted-foreground">
                  <p><strong>Cause:</strong> Your browser cached an old version of the site.</p>
                  <p><strong>Fix:</strong> Clear your browser cache. See "How to Clear Cache" section below.</p>
                </div>
              </div>

              {/* Problem 5 */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Stocker stops listening after a while
                </h4>
                <div className="ml-7 space-y-2 text-muted-foreground">
                  <p><strong>Possible causes:</strong> The app was backgrounded, the network dropped, microphone permission changed, or a Bluetooth microphone disconnected.</p>
                  <p><strong>Fix:</strong> Bring Stocker to the foreground. Wait while it says it is reconnecting. If it says “tap to reconnect,” tap that message. Reinsert Bluetooth earbuds, or switch to the phone microphone, and allow microphone access if prompted.</p>
                </div>
              </div>

              {/* Problem 6 */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  "No internet connection" error
                </h4>
                <div className="ml-7 space-y-2 text-muted-foreground">
                  <p><strong>Possible cause:</strong> WiFi or mobile data dropped, or the service could not be reached.</p>
                  <p><strong>Fix:</strong> Restore internet and wait for the reconnect message. If voice stops retrying, tap “Voice paused — tap to reconnect.” Confirm the item still shown before repeating a command.</p>
                </div>
              </div>

              {/* Problem 7 */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Stocker doesn't hear me when using AirPods / Bluetooth headphones
                </h4>
                <div className="ml-7 space-y-2 text-muted-foreground">
                  <p><strong>Possible cause:</strong> The browser lost or changed its microphone when the headset disconnected.</p>
                  <p><strong>Fix (iPhone):</strong></p>
                  <ol className="list-decimal ml-4 space-y-1 text-sm">
                    <li>Swipe down from top-right corner to open Control Center</li>
                    <li>Reconnect the AirPods, return to Stocker, and wait for microphone recovery</li>
                    <li>If Stocker asks, tap to reconnect and allow microphone access</li>
                    <li>AirPlay selects playback output; it does not guarantee the browser's microphone input</li>
                  </ol>
                  <p><strong>Fix (Android):</strong></p>
                  <ol className="list-decimal ml-4 space-y-1 text-sm">
                    <li>In Chrome, tap the lock icon in the address bar</li>
                    <li>Tap "Site settings" → Microphone → Allow</li>
                    <li>Make sure Bluetooth headset is set as audio input in phone settings</li>
                  </ol>
                  <p className="text-sm mt-2"><strong>Tip:</strong> If Bluetooth won't work, try using the phone's built-in mic instead.</p>
                </div>
              </div>
            </div>
          </div>

          {/* IPHONE COMPLETE SETUP GUIDE */}
          <div id="iphone-setup" className="mb-12">
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-8 text-white">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
                  <span className="text-2xl">🍎</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold">iPhone Complete Setup Guide</h2>
                  <p className="text-gray-400">Menu names can vary by iPhone and iOS version</p>
                </div>
              </div>

              {/* iPhone Step 1: Browser */}
              <div className="bg-white/10 rounded-xl p-5 mb-4">
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                  Open Stocker in Safari or the installed web app
                </h4>
                <p className="text-gray-300 mb-3">Safari works better with voice on iPhone. Chrome has issues.</p>
                <div className="bg-black/30 rounded-lg p-3">
                  <p className="text-sm text-gray-400">✅ Open Safari (the blue compass icon)</p>
                  <p className="text-sm text-gray-400">✅ Type: <strong className="text-white">stocker-ai.com</strong></p>
                  <p className="text-sm text-red-400">❌ Do NOT use a saved bookmark to an old site</p>
                </div>
              </div>

              {/* iPhone Step 2: Screen Lock */}
              <div className="bg-white/10 rounded-xl p-5 mb-4">
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                  Keep Stocker Available While Picking
                </h4>
                <p className="text-gray-300 mb-3">Stocker requests a wake lock, but iOS can still suspend a browser. Reopen Stocker and continue if that happens.</p>
                <div className="bg-black/30 rounded-lg p-3 space-y-1">
                  <p className="text-sm text-gray-300"><strong>1.</strong> Go to <strong className="text-white">Settings</strong> (gear icon on home screen)</p>
                  <p className="text-sm text-gray-300"><strong>2.</strong> Tap <strong className="text-white">Display & Brightness</strong></p>
                  <p className="text-sm text-gray-300"><strong>3.</strong> Tap <strong className="text-white">Auto-Lock</strong></p>
                  <p className="text-sm text-gray-300"><strong>4.</strong> Select <strong className="text-green-400">Never</strong></p>
                  <p className="text-sm text-yellow-400 pt-2">⚠️ Remember to turn this back on after you're done stocking!</p>
                </div>
              </div>

              {/* iPhone Step 3: Microphone Permission */}
              <div className="bg-white/10 rounded-xl p-5 mb-4">
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                  Allow Microphone Access
                </h4>
                <p className="text-gray-300 mb-3">When asked, say YES to microphone permission.</p>
                <div className="bg-black/30 rounded-lg p-3 space-y-1">
                  <p className="text-sm text-gray-300">When you see "stocker-ai.com wants to use your microphone"</p>
                  <p className="text-sm text-green-400"><strong>→ Tap "Allow"</strong></p>
                  <p className="text-sm text-gray-400 pt-2">If you accidentally tapped "Don't Allow":</p>
                  <p className="text-sm text-gray-300">Settings → Safari → scroll down → Microphone → Allow</p>
                </div>
              </div>

              {/* iPhone Step 4: Silent Mode */}
              <div className="bg-white/10 rounded-xl p-5 mb-4">
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold">4</span>
                  Turn OFF Silent Mode
                </h4>
                <p className="text-gray-300 mb-3">You won't hear Stocker talk if your phone is on silent!</p>
                <div className="bg-black/30 rounded-lg p-3">
                  <p className="text-sm text-gray-300">Look at the left side of your iPhone above the volume buttons.</p>
                  <p className="text-sm text-gray-300">There's a small switch. Make sure it's pushed toward the screen (no orange showing).</p>
                  <p className="text-sm text-red-400">If you see <strong>orange</strong> = silent mode ON = you can't hear!</p>
                  <p className="text-sm text-green-400">If you see <strong>no orange</strong> = sound is ON = good!</p>
                </div>
              </div>

              {/* iPhone Step 5: Volume */}
              <div className="bg-white/10 rounded-xl p-5 mb-4">
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold">5</span>
                  Turn Volume UP
                </h4>
                <div className="bg-black/30 rounded-lg p-3">
                  <p className="text-sm text-gray-300">Set media volume to a comfortable level where instructions are easy to hear.</p>
                </div>
              </div>

              {/* iPhone Step 6: AirPods/Bluetooth */}
              <div className="bg-white/10 rounded-xl p-5 mb-4">
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold">6</span>
                  Using AirPods or Bluetooth Headphones? (Important!)
                </h4>
                <p className="text-gray-300 mb-3">Bluetooth mics can be tricky. Follow these steps:</p>
                <div className="bg-black/30 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-gray-300"><strong>1.</strong> Connect your AirPods/headphones BEFORE opening the Voice App</p>
                  <p className="text-sm text-gray-300"><strong>2.</strong> Start Stocker and confirm it can hear a short test phrase before beginning the route</p>
                  <p className="text-sm text-gray-300"><strong>3.</strong> If you remove and reinsert the earbuds, return to Stocker and wait for recovery</p>
                  <p className="text-sm text-gray-300"><strong>4.</strong> If prompted, tap to reconnect voice</p>
                  <p className="text-sm text-gray-300"><strong>5.</strong> AirPlay controls playback; browser microphone routing varies by iPhone and iOS version</p>
                  <p className="text-sm text-yellow-400 pt-2">⚠️ If Stocker can't hear you with AirPods, try using the phone's built-in mic instead - it's more reliable!</p>
                </div>
              </div>

              {/* iPhone Clear Cache */}
              <div className="bg-white/10 rounded-xl p-5">
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  If Site Looks Wrong - Clear Safari Cache
                </h4>
                <div className="bg-black/30 rounded-lg p-3 space-y-1">
                  <p className="text-sm text-gray-300"><strong>1.</strong> Go to <strong className="text-white">Settings</strong> app</p>
                  <p className="text-sm text-gray-300"><strong>2.</strong> Scroll down, tap <strong className="text-white">Safari</strong></p>
                  <p className="text-sm text-gray-300"><strong>3.</strong> Tap <strong className="text-white">Clear History and Website Data</strong></p>
                  <p className="text-sm text-gray-300"><strong>4.</strong> Tap <strong className="text-white">Clear History and Data</strong> to confirm</p>
                  <p className="text-sm text-gray-300"><strong>5.</strong> Go back to Safari, type <strong className="text-white">stocker-ai.com</strong> again</p>
                </div>
              </div>
            </div>
          </div>

          {/* ANDROID COMPLETE SETUP GUIDE */}
          <div id="android-setup" className="mb-12">
            <div className="bg-gradient-to-r from-green-900 to-green-800 rounded-2xl p-8 text-white">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
                  <span className="text-2xl">🤖</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Android Complete Setup Guide</h2>
                  <p className="text-green-300">Menu names can vary by phone and Android version</p>
                </div>
              </div>

              {/* Android Step 1: Browser */}
              <div className="bg-white/10 rounded-xl p-5 mb-4">
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                  Use Chrome Browser
                </h4>
                <p className="text-green-200 mb-3">Chrome works best on Android for voice recognition.</p>
                <div className="bg-black/30 rounded-lg p-3">
                  <p className="text-sm text-gray-300">✅ Open Chrome (the colorful circle icon)</p>
                  <p className="text-sm text-gray-300">✅ Type: <strong className="text-white">stocker-ai.com</strong></p>
                  <p className="text-sm text-gray-400">If another browser has microphone trouble, retry in Chrome or the installed web app.</p>
                </div>
              </div>

              {/* Android Step 2: Screen Timeout */}
              <div className="bg-white/10 rounded-xl p-5 mb-4">
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                  Keep Stocker Available While Picking
                </h4>
                <p className="text-green-200 mb-3">Stocker requests a wake lock, but Android can still suspend a backgrounded browser. Reopen Stocker and continue if that happens.</p>
                <div className="bg-black/30 rounded-lg p-3 space-y-1">
                  <p className="text-sm text-gray-300"><strong>1.</strong> Go to <strong className="text-white">Settings</strong> (gear icon)</p>
                  <p className="text-sm text-gray-300"><strong>2.</strong> Tap <strong className="text-white">Display</strong></p>
                  <p className="text-sm text-gray-300"><strong>3.</strong> Tap <strong className="text-white">Screen timeout</strong></p>
                  <p className="text-sm text-gray-300"><strong>4.</strong> Select <strong className="text-green-400">30 minutes</strong> or <strong className="text-green-400">Never</strong></p>
                  <p className="text-sm text-yellow-400 pt-2">⚠️ Some phones: Settings → Display → Advanced → Screen timeout</p>
                  <p className="text-sm text-yellow-400">⚠️ Samsung phones: Settings → Display → Screen timeout</p>
                </div>
              </div>

              {/* Android Step 3: Microphone Permission */}
              <div className="bg-white/10 rounded-xl p-5 mb-4">
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                  Allow Microphone Access
                </h4>
                <p className="text-green-200 mb-3">When asked, tap ALLOW for microphone.</p>
                <div className="bg-black/30 rounded-lg p-3 space-y-1">
                  <p className="text-sm text-gray-300">When you see "Allow stocker-ai.com to use your microphone?"</p>
                  <p className="text-sm text-green-400"><strong>→ Tap "Allow"</strong></p>
                  <p className="text-sm text-gray-400 pt-2">If you accidentally tapped "Block":</p>
                  <p className="text-sm text-gray-300">Tap the lock icon in the address bar → Site settings → Microphone → Allow</p>
                </div>
              </div>

              {/* Android Step 4: Volume & Sound */}
              <div className="bg-white/10 rounded-xl p-5 mb-4">
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-sm font-bold">4</span>
                  Check Volume & Do Not Disturb
                </h4>
                <div className="bg-black/30 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-gray-300"><strong>Volume:</strong> Set media volume to a comfortable, clearly audible level</p>
                  <p className="text-sm text-gray-300"><strong>Do Not Disturb:</strong> Make sure it's OFF</p>
                  <p className="text-sm text-gray-400">→ Swipe down from top of screen</p>
                  <p className="text-sm text-gray-400">→ Look for "Do Not Disturb" or moon icon</p>
                  <p className="text-sm text-gray-400">→ Make sure it's NOT highlighted/enabled</p>
                </div>
              </div>

              {/* Android Step 5: Battery Optimization */}
              <div className="bg-white/10 rounded-xl p-5 mb-4">
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-sm font-bold">5</span>
                  Disable Battery Optimization for Chrome (Optional but Recommended)
                </h4>
                <p className="text-green-200 mb-3">Stops Android from killing Chrome in the background.</p>
                <div className="bg-black/30 rounded-lg p-3 space-y-1">
                  <p className="text-sm text-gray-300"><strong>1.</strong> Settings → Apps → Chrome</p>
                  <p className="text-sm text-gray-300"><strong>2.</strong> Tap <strong className="text-white">Battery</strong></p>
                  <p className="text-sm text-gray-300"><strong>3.</strong> Select <strong className="text-green-400">Unrestricted</strong> or <strong className="text-green-400">Don't optimize</strong></p>
                </div>
              </div>

              {/* Android Step 6: Bluetooth Headphones */}
              <div className="bg-white/10 rounded-xl p-5 mb-4">
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-sm font-bold">6</span>
                  Using Bluetooth Headphones? (Important!)
                </h4>
                <p className="text-green-200 mb-3">Bluetooth mics can be tricky. Follow these steps:</p>
                <div className="bg-black/30 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-gray-300"><strong>1.</strong> Connect your Bluetooth headphones BEFORE opening the Voice App</p>
                  <p className="text-sm text-gray-300"><strong>2.</strong> In Chrome, tap the <strong className="text-white">lock icon</strong> in the address bar</p>
                  <p className="text-sm text-gray-300"><strong>3.</strong> Tap <strong className="text-white">Site settings</strong></p>
                  <p className="text-sm text-gray-300"><strong>4.</strong> Tap <strong className="text-white">Microphone</strong> → make sure it says <strong className="text-green-400">Allow</strong></p>
                  <p className="text-sm text-gray-300"><strong>5.</strong> Check phone Settings → <strong className="text-white">Connected devices</strong> → your headphones → make sure <strong className="text-white">Phone calls</strong> or <strong className="text-white">Media audio</strong> is enabled</p>
                  <p className="text-sm text-yellow-400 pt-2">⚠️ If Stocker can't hear you with Bluetooth, try using the phone's built-in mic instead - it's more reliable!</p>
                </div>
              </div>

              {/* Android Clear Cache */}
              <div className="bg-white/10 rounded-xl p-5">
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  If Site Looks Wrong - Clear Chrome Cache
                </h4>
                <div className="bg-black/30 rounded-lg p-3 space-y-1">
                  <p className="text-sm text-gray-300"><strong>1.</strong> Open Chrome</p>
                  <p className="text-sm text-gray-300"><strong>2.</strong> Tap the <strong className="text-white">three dots ⋮</strong> at top right</p>
                  <p className="text-sm text-gray-300"><strong>3.</strong> Tap <strong className="text-white">Settings</strong></p>
                  <p className="text-sm text-gray-300"><strong>4.</strong> Tap <strong className="text-white">Privacy and security</strong></p>
                  <p className="text-sm text-gray-300"><strong>5.</strong> Tap <strong className="text-white">Clear browsing data</strong></p>
                  <p className="text-sm text-gray-300"><strong>6.</strong> Check <strong className="text-white">Cached images and files</strong></p>
                  <p className="text-sm text-gray-300"><strong>7.</strong> Tap <strong className="text-white">Clear data</strong></p>
                  <p className="text-sm text-gray-300"><strong>8.</strong> Go back, type <strong className="text-white">stocker-ai.com</strong> again</p>
                </div>
              </div>
            </div>
          </div>

          {/* LAPTOP/COMPUTER SETUP */}
          <div id="computer-setup" className="bg-card border border-border rounded-2xl p-8 mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                <span className="text-2xl">💻</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Computer / Laptop Setup</h2>
                <p className="text-muted-foreground">Using Stocker on a laptop or desktop computer</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-muted/50 rounded-xl p-5">
                <h4 className="font-semibold text-foreground mb-3">Required Setup</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>✅ Use <strong>Chrome</strong> or <strong>Edge</strong> browser (NOT Firefox)</li>
                  <li>✅ Go to <strong>stocker-ai.com</strong></li>
                  <li>✅ Click <strong>Allow</strong> when asked for microphone access</li>
                  <li>✅ Make sure speakers or headphones are working</li>
                  <li>✅ Disable screen saver or set to 30+ minutes</li>
                </ul>
              </div>

              <div className="bg-muted/50 rounded-xl p-5">
                <h4 className="font-semibold text-foreground mb-3">Quick Cache Clear</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><strong>Hard Refresh:</strong></li>
                  <li>• Windows: <strong>Ctrl + Shift + R</strong></li>
                  <li>• Mac: <strong>Cmd + Shift + R</strong></li>
                  <li className="pt-2"><strong>Full Cache Clear:</strong></li>
                  <li>• Windows: <strong>Ctrl + Shift + Delete</strong></li>
                  <li>• Mac: <strong>Cmd + Shift + Delete</strong></li>
                  <li>• Select "Cached images and files" → Clear</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Typical Flow Section */}
          <div className="bg-card border border-border rounded-2xl p-8 mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-6 text-center">
              Typical Stocking Flow
            </h2>
            <div className="grid md:grid-cols-5 gap-4 text-center">
              {[
                { step: "1", text: "Open app, AI greets you with your routes" },
                { step: "2", text: 'Say "start" or route name' },
                { step: "3", text: 'Choose "top" or "bottom" for pick order' },
                { step: "4", text: 'Say "next" or "got it" after each pick' },
                { step: "5", text: "Repeat for each machine until done" },
              ].map((item, idx) => (
                <div key={idx} className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center mb-3">
                    {item.step}
                  </div>
                  <p className="text-sm text-muted-foreground">{item.text}</p>
                  {idx < 4 && (
                    <ArrowRight className="h-4 w-4 text-muted-foreground/50 mt-3 hidden md:block" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground mb-4">
              Ready to try it?
            </h2>
            <p className="text-muted-foreground mb-6">
              Start your 14-day free trial and experience hands-free stocking.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/signup">
                <Button className="btn-primary" size="lg">
                  Start Free Trial
                </Button>
              </Link>
              <Link to="/pricing">
                <Button variant="outline" size="lg">
                  View Pricing
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Guide;
