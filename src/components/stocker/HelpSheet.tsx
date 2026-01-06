import { X, Mic, ArrowRight, CheckCircle, SkipForward, RotateCcw, Repeat, Route, HelpCircle, Package, MapPin, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface HelpSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const quickCommands = [
  {
    category: "Moving to Next Item",
    icon: ArrowRight,
    color: "text-emerald-400",
    commands: [
      '"Got it" / "Next" / "Done"',
      '"Yep, next one" / "Okay, what\'s next?"',
      '"Perfect" / "Good" / "Alright"',
      'Speak naturally - Stocker understands!',
    ]
  },
  {
    category: "Checking Inventory",
    icon: Package,
    color: "text-blue-400",
    commands: [
      '"How many are in the machine?"',
      '"What\'s the current inventory?"',
      '"How many should be in there?"',
      '"What\'s the par level?"',
    ]
  },
  {
    category: "Checking Your Progress",
    icon: CheckCircle,
    color: "text-yellow-400",
    commands: [
      '"How many items do I have left?"',
      '"What\'s my progress?"',
      '"How many machines are left?"',
      '"What route am I on?"',
      '"Which machine am I working on?"',
      '"Which machines did I skip?"',
    ]
  },
  {
    category: "Starting a Machine",
    icon: MapPin,
    color: "text-teal-400",
    commands: [
      '"Start from the top"',
      '"Stock from the beginning"',
      '"Start from the bottom"',
      '"Work from the end of the list"',
    ]
  },
  {
    category: "Skipping a Machine",
    icon: SkipForward,
    color: "text-orange-400",
    commands: [
      '"Skip this machine"',
      '"Go to the next machine"',
      '"Come back to this one later"',
      '(Stocker will ask you to confirm with "yes")',
    ]
  },
  {
    category: "Fixing Mistakes",
    icon: RotateCcw,
    color: "text-purple-400",
    commands: [
      '"Undo that" / "Go back one"',
      '"Oops, that was wrong"',
      '"That was a mistake"',
      '"Go back to the skipped machine"',
    ]
  },
  {
    category: "Picking Your Route",
    icon: Route,
    color: "text-cyan-400",
    commands: [
      '"Start North Route"',
      '"Switch to the West Route"',
      '"Let\'s do the downtown route"',
      'Just say the route name - Stocker will find it!',
    ]
  },
  {
    category: "Pause & Wake Up",
    icon: Mic,
    color: "text-red-400",
    commands: [
      'Pause: "Pause" / "Mute"',
      'Wake up: "Hey Stocker"',
      'Stocker auto-pauses when you stop talking',
    ]
  },
];

export function HelpSheet({ isOpen, onClose }: HelpSheetProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className={cn(
        "fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-3xl",
        "max-h-[80vh] overflow-y-auto",
        "animate-slide-in-up shadow-2xl border-t border-border"
      )}>
        {/* Handle */}
        <div className="sticky top-0 bg-background pt-3 pb-2 px-4 border-b border-border">
          <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Quick Commands</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-muted transition-colors"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Commands Grid */}
        <div className="p-4 space-y-3">
          {quickCommands.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.category}
                className="bg-muted/50 rounded-xl p-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={cn("h-4 w-4", section.color)} />
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    {section.category}
                  </span>
                </div>
                <div className="space-y-1">
                  {section.commands.map((cmd, idx) => (
                    <p key={idx} className="text-sm text-muted-foreground leading-relaxed">
                      {cmd}
                    </p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pro Tips */}
        <div className="px-4 pb-6 space-y-2">
          <div className="bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/20">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-emerald-400">Natural Speech:</span> Say commands naturally -
              "got it", "yep", or "next" all work the same. No need to be robotic!
            </p>
          </div>
          <div className="bg-yellow-500/10 rounded-xl p-3 border border-yellow-500/20">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-yellow-400">Important:</span> Speak clearly,
              keep screen ON, one person per mic. Skip machines need confirmation with "yes".
            </p>
          </div>
          <div className="bg-blue-500/10 rounded-xl p-3 border border-blue-500/20">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-blue-400">Quick Tip:</span> Say "Hey Stocker"
              anytime to wake the app. Use "What's my progress?" to check your status.
            </p>
          </div>
          <div className="text-center mt-4">
            <a
              href="/troubleshooting"
              target="_blank"
              className="text-sm text-primary hover:underline font-medium"
            >
              📱 Having problems? View Troubleshooting Guide →
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
