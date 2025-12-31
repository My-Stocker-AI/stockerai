import { Link } from "react-router-dom";
import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";
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
  VolumeX
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
