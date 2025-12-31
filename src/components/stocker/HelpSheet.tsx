import { X, Mic, ArrowRight, CheckCircle, SkipForward, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface HelpSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const quickCommands = [
  {
    category: "Move Forward",
    icon: ArrowRight,
    color: "text-primary",
    commands: [
      '"Next" / "Done" / "Got it"',
      '"Yes" / "Yep" / "Check"',
    ]
  },
  {
    category: "Go Back",
    icon: RotateCcw,
    color: "text-purple-400",
    commands: [
      '"Undo" / "Oops" / "Go back"',
      '"Wrong" / "Mistake"',
    ]
  },
  {
    category: "Skip Machine",
    icon: SkipForward,
    color: "text-orange-400",
    commands: [
      '"Skip" / "Skip machine"',
      '"Next machine"',
    ]
  },
  {
    category: "Mic Control",
    icon: Mic,
    color: "text-red-400",
    commands: [
      '"Pause" / "Mute"',
      '"OK Stocker" to resume',
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
        <div className="p-4 grid grid-cols-2 gap-3">
          {quickCommands.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.category}
                className="bg-muted/50 rounded-xl p-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={cn("h-4 w-4", section.color)} />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {section.category}
                  </span>
                </div>
                <div className="space-y-1">
                  {section.commands.map((cmd, idx) => (
                    <p key={idx} className="text-sm text-foreground">
                      {cmd}
                    </p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pro Tip */}
        <div className="px-4 pb-4">
          <div className="bg-primary/10 rounded-xl p-3 border border-primary/20">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-primary">Tip:</span> Speak naturally -
              you can say "got it", "yep", "check", or just "next" to move forward.
            </p>
          </div>
        </div>

        {/* More Commands Link */}
        <div className="px-4 pb-6 text-center">
          <a
            href="/guide"
            target="_blank"
            className="text-sm text-primary hover:underline"
          >
            View all commands →
          </a>
        </div>
      </div>
    </>
  );
}
