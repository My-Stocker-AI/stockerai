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
      { phrase: '"Go back" / "Undo"', description: "Return to the previous item" },
      { phrase: '"Oops" / "Wrong" / "Mistake"', description: "Undo last confirmation" },
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
      { phrase: '"Pause" / "Stop listening"', description: "Pause voice recognition" },
      { phrase: '"Mute" / "Mute mic"', description: "Mute the microphone" },
      { phrase: 'Say "OK Stocker"', description: "Wake phrase to resume listening" },
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
      { phrase: '"How many left?"', description: "Get remaining items count" },
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
                      <strong className="text-foreground">Keep the screen ON while working</strong>
                      <p className="text-sm text-muted-foreground mt-1">Screen sleep can interrupt voice recognition. Disable auto-lock in your phone settings.</p>
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
                      <strong className="text-foreground">Delete old routes before re-uploading</strong>
                      <p className="text-sm text-muted-foreground mt-1">You cannot upload the same route + date twice. Delete the old one first from Dashboard → My Routes.</p>
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
                      <p className="text-sm text-muted-foreground mt-1">Stocker will ask for confirmation before actually skipping.</p>
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
                      <strong className="text-foreground">Don't upload duplicate routes</strong>
                      <p className="text-sm text-muted-foreground mt-1">Uploading "North Route" for Dec 30 when it already exists will fail. Delete first!</p>
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
                      <p className="text-sm text-muted-foreground mt-1">Always go to my-stocker-ai.com fresh. Clear cache if things look wrong.</p>
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
                    <strong className="text-foreground">Important: One route per date!</strong>
                    <p className="text-sm text-muted-foreground mt-1">
                      You cannot upload "North Route" for December 30th if it already exists.
                      You must delete the existing route first before uploading a new version.
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
                      <span>Select your POS Data PDF file</span>
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
                      <span>Go to Dashboard → My Routes</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-red-500/10 text-red-500 text-sm font-bold flex items-center justify-center shrink-0">2</span>
                      <span>Find the route you want to replace</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-red-500/10 text-red-500 text-sm font-bold flex items-center justify-center shrink-0">3</span>
                      <span>Click the trash icon to DELETE it</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">4</span>
                      <span>Now upload the new version</span>
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
                  <p><strong>Cause:</strong> You're asking for a different date than the route is scheduled for.</p>
                  <p><strong>Fix:</strong> Say "What routes do I have for [exact date]?" using the date in your PDF. Check My Routes in the dashboard to see what dates your routes are assigned to.</p>
                </div>
              </div>

              {/* Problem 2 */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Upload fails with "already exists" error
                </h4>
                <div className="ml-7 space-y-2 text-muted-foreground">
                  <p><strong>Cause:</strong> A route with the same name and date already exists in your account.</p>
                  <p><strong>Fix:</strong> Go to Dashboard → My Routes → Delete the existing route → Try uploading again.</p>
                </div>
              </div>

              {/* Problem 3 */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Stocker says "skip machine" when I said "next"
                </h4>
                <div className="ml-7 space-y-2 text-muted-foreground">
                  <p><strong>Cause:</strong> Garbled audio from rushing, multiple voices, or background noise.</p>
                  <p><strong>Fix:</strong> Speak clearly and at normal speed. Use ONE person per device. Stocker now asks for confirmation before skipping - just say "no" if it misheard you.</p>
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
                  <p><strong>Cause:</strong> Screen went to sleep, killing the voice recognition.</p>
                  <p><strong>Fix:</strong> Keep screen on. On iPhone: Settings → Display & Brightness → Auto-Lock → Never. On Android: Settings → Display → Screen timeout → 30 minutes or Never.</p>
                </div>
              </div>

              {/* Problem 6 */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  "No internet connection" error
                </h4>
                <div className="ml-7 space-y-2 text-muted-foreground">
                  <p><strong>Cause:</strong> WiFi dropped or mobile data is off.</p>
                  <p><strong>Fix:</strong> Check your WiFi/data connection. Stocker requires internet - it doesn't work offline.</p>
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
                  <p className="text-gray-400">Follow these steps EXACTLY for best results</p>
                </div>
              </div>

              {/* iPhone Step 1: Browser */}
              <div className="bg-white/10 rounded-xl p-5 mb-4">
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                  Use Safari (NOT Chrome)
                </h4>
                <p className="text-gray-300 mb-3">Safari works better with voice on iPhone. Chrome has issues.</p>
                <div className="bg-black/30 rounded-lg p-3">
                  <p className="text-sm text-gray-400">✅ Open Safari (the blue compass icon)</p>
                  <p className="text-sm text-gray-400">✅ Type: <strong className="text-white">my-stocker-ai.com</strong></p>
                  <p className="text-sm text-red-400">❌ Do NOT use a saved bookmark to an old site</p>
                </div>
              </div>

              {/* iPhone Step 2: Screen Lock */}
              <div className="bg-white/10 rounded-xl p-5 mb-4">
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                  Turn OFF Auto-Lock (CRITICAL!)
                </h4>
                <p className="text-gray-300 mb-3">If your screen turns off, voice stops working!</p>
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
                  <p className="text-sm text-gray-300">When you see "my-stocker-ai.com wants to use your microphone"</p>
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
                  <p className="text-sm text-gray-300">Press the volume up button on the left side of your phone until it's at max.</p>
                  <p className="text-sm text-gray-300">Or connect Bluetooth headphones/earbuds for better hearing in loud warehouses.</p>
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
                  <p className="text-sm text-gray-300"><strong>5.</strong> Go back to Safari, type <strong className="text-white">my-stocker-ai.com</strong> again</p>
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
                  <p className="text-green-300">Follow these steps EXACTLY for best results</p>
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
                  <p className="text-sm text-gray-300">✅ Type: <strong className="text-white">my-stocker-ai.com</strong></p>
                  <p className="text-sm text-red-400">❌ Do NOT use Samsung Internet or other browsers</p>
                </div>
              </div>

              {/* Android Step 2: Screen Timeout */}
              <div className="bg-white/10 rounded-xl p-5 mb-4">
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                  Turn OFF Screen Timeout (CRITICAL!)
                </h4>
                <p className="text-green-200 mb-3">If your screen turns off, voice stops working!</p>
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
                  <p className="text-sm text-gray-300">When you see "Allow my-stocker-ai.com to use your microphone?"</p>
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
                  <p className="text-sm text-gray-300"><strong>Volume:</strong> Press volume up button until at max</p>
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
                  <p className="text-sm text-gray-300"><strong>8.</strong> Go back, type <strong className="text-white">my-stocker-ai.com</strong> again</p>
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
                  <li>✅ Go to <strong>my-stocker-ai.com</strong></li>
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
