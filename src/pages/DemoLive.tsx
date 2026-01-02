import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mic, MicOff, Volume2, CheckCircle, AlertTriangle, X, Loader2, ArrowRight, RefreshCw, Play } from 'lucide-react';
import { useVoice } from '@/hooks/useVoice';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Demo-specific types
interface DemoItem {
  id: string;
  route_number: number;
  route_name: string;
  machine_number: number;
  machine_name: string;
  machine_location: string;
  item_sequence: number;
  item_name: string;
  item_quantity: number;
  slot_number: string;
}

interface DemoUser {
  firstName: string;
  email: string;
  discountCode?: string;
}

// Simple TTS endpoint
const TTS_URL = 'https://solitary-base-799c.russ-731.workers.dev';

export default function DemoLive() {
  const navigate = useNavigate();
  const [demoUser, setDemoUser] = useState<DemoUser | null>(null);
  const [demoRoutes, setDemoRoutes] = useState<DemoItem[]>([]);
  const [currentRoute, setCurrentRoute] = useState<number | null>(null);
  const [currentMachine, setCurrentMachine] = useState<number | null>(null);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [completedItems, setCompletedItems] = useState<DemoItem[]>([]);
  const [completedMachines, setCompletedMachines] = useState<number>(0);
  const [demoStarted, setDemoStarted] = useState(false);
  const [demoComplete, setDemoComplete] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [showExitPopup, setShowExitPopup] = useState(false);
  const [showNextButton, setShowNextButton] = useState(false);
  const [stuckTimer, setStuckTimer] = useState<NodeJS.Timeout | null>(null);
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied' | 'checking'>('checking');
  const [isLoading, setIsLoading] = useState(true);
  const processingRef = useRef(false);
  const voiceRef = useRef<any>(null);

  // Refs to avoid stale closures in voice callbacks
  const demoStartedRef = useRef(false);
  const demoRoutesRef = useRef<DemoItem[]>([]);
  const currentRouteRef = useRef<number | null>(null);
  const currentMachineRef = useRef<number | null>(null);
  const currentItemIndexRef = useRef(0);
  const completedItemsRef = useRef<DemoItem[]>([]);
  const completedMachinesRef = useRef(0);
  const demoUserRef = useRef<DemoUser | null>(null);

  // Refs for handlers to avoid stale closures
  const handleStartDemoRef = useRef<() => Promise<void>>();
  const handleNextRef = useRef<() => Promise<void>>();

  // Sync state to refs for voice callbacks
  useEffect(() => { demoStartedRef.current = demoStarted; }, [demoStarted]);
  useEffect(() => { demoRoutesRef.current = demoRoutes; }, [demoRoutes]);
  useEffect(() => { currentRouteRef.current = currentRoute; }, [currentRoute]);
  useEffect(() => { currentMachineRef.current = currentMachine; }, [currentMachine]);
  useEffect(() => { currentItemIndexRef.current = currentItemIndex; }, [currentItemIndex]);
  useEffect(() => { completedItemsRef.current = completedItems; }, [completedItems]);
  useEffect(() => { completedMachinesRef.current = completedMachines; }, [completedMachines]);
  useEffect(() => { demoUserRef.current = demoUser; }, [demoUser]);

  // Load demo user from session storage
  useEffect(() => {
    const stored = sessionStorage.getItem('demo_user');
    if (!stored) {
      navigate('/demo');
      return;
    }
    setDemoUser(JSON.parse(stored));
  }, [navigate]);

  // Load demo routes from Supabase
  useEffect(() => {
    const loadDemoRoutes = async () => {
      const { data, error } = await supabase
        .from('demo_routes')
        .select('*')
        .order('route_number', { ascending: true })
        .order('machine_number', { ascending: true })
        .order('item_sequence', { ascending: true });

      if (error) {
        console.error('Error loading demo routes:', error);
        return;
      }

      setDemoRoutes(data || []);
      setIsLoading(false);
    };

    loadDemoRoutes();
  }, []);

  // Check mic permission on load
  useEffect(() => {
    const checkMicPermission = async () => {
      try {
        if (navigator.permissions) {
          const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          setMicPermission(result.state as 'prompt' | 'granted' | 'denied');
          result.onchange = () => setMicPermission(result.state as 'prompt' | 'granted' | 'denied');
        } else {
          setMicPermission('prompt');
        }
      } catch {
        setMicPermission('prompt');
      }
    };
    checkMicPermission();
  }, []);

  // beforeunload handler - show exit popup instead of leaving
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (demoStarted && !demoComplete) {
        e.preventDefault();
        e.returnValue = '';
        setShowExitPopup(true);
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [demoStarted, demoComplete]);

  // Get current item helper
  const getCurrentItem = useCallback((): DemoItem | null => {
    if (currentRoute === null || currentMachine === null) return null;

    const machineItems = demoRoutes.filter(
      item => item.route_number === currentRoute && item.machine_number === currentMachine
    );

    return machineItems[currentItemIndex] || null;
  }, [demoRoutes, currentRoute, currentMachine, currentItemIndex]);

  // Get items for current machine
  const getMachineItems = useCallback(() => {
    if (currentRoute === null || currentMachine === null) return [];
    return demoRoutes.filter(
      item => item.route_number === currentRoute && item.machine_number === currentMachine
    );
  }, [demoRoutes, currentRoute, currentMachine]);

  // Get unique machines for current route
  const getRouteMachines = useCallback(() => {
    if (currentRoute === null) return [];
    const machines = demoRoutes
      .filter(item => item.route_number === currentRoute)
      .map(item => ({ number: item.machine_number, name: item.machine_name }));
    return [...new Map(machines.map(m => [m.number, m])).values()];
  }, [demoRoutes, currentRoute]);

  // Get unique routes
  const getUniqueRoutes = useCallback(() => {
    const routes = demoRoutes.map(item => ({ number: item.route_number, name: item.route_name }));
    return [...new Map(routes.map(r => [r.number, r])).values()];
  }, [demoRoutes]);

  // Start stuck timer (show Next button after 10 seconds)
  const startStuckTimer = useCallback(() => {
    if (stuckTimer) clearTimeout(stuckTimer);
    const timer = setTimeout(() => {
      setShowNextButton(true);
    }, 10000);
    setStuckTimer(timer);
  }, [stuckTimer]);

  // Clear stuck timer
  const clearStuckTimer = useCallback(() => {
    if (stuckTimer) {
      clearTimeout(stuckTimer);
      setStuckTimer(null);
    }
    setShowNextButton(false);
  }, [stuckTimer]);

  // Speak response
  const speakResponse = useCallback(async (text: string) => {
    setAiResponse(text);
    const v = voiceRef.current;
    if (v) {
      await v.speak(text);
    }
    startStuckTimer();
  }, [startStuckTimer]);

  // Handle starting the demo
  const handleStartDemo = useCallback(async () => {
    if (!demoUser) return;

    clearStuckTimer();
    setDemoStarted(true);

    // Start with route 1, machine 1
    setCurrentRoute(1);
    setCurrentMachine(1);
    setCurrentItemIndex(0);

    const firstItem = demoRoutes.find(i => i.route_number === 1 && i.machine_number === 1 && i.item_sequence === 1);
    if (firstItem) {
      const greeting = `Hey ${demoUser.firstName}! Let's stock the ${firstItem.machine_name}. Your first item is ${firstItem.item_quantity} ${firstItem.item_name}, slot ${firstItem.slot_number}. Say "next" when you've grabbed it!`;
      await speakResponse(greeting);
    }
  }, [demoUser, demoRoutes, speakResponse, clearStuckTimer]);

  // Sync handleStartDemo to ref
  useEffect(() => { handleStartDemoRef.current = handleStartDemo; }, [handleStartDemo]);

  // Handle next item
  const handleNext = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    clearStuckTimer();

    const v = voiceRef.current;
    const currentItem = getCurrentItem();
    const machineItems = getMachineItems();
    const routeMachines = getRouteMachines();

    if (currentItem) {
      // Add to completed
      setCompletedItems(prev => [...prev, currentItem]);
      v?.playSuccessBeep();
    }

    // Check if more items in current machine
    if (currentItemIndex < machineItems.length - 1) {
      setCurrentItemIndex(prev => prev + 1);
      const nextItem = machineItems[currentItemIndex + 1];

      // Vary the response style
      const styles = [
        `${nextItem.item_quantity} ${nextItem.item_name}, slot ${nextItem.slot_number}`,
        `Next up, ${nextItem.item_quantity} ${nextItem.item_name}, slot ${nextItem.slot_number}`,
        `Grab ${nextItem.item_quantity} ${nextItem.item_name}, slot ${nextItem.slot_number}`,
        `Got it. ${nextItem.item_quantity} ${nextItem.item_name}, slot ${nextItem.slot_number}`,
      ];
      await speakResponse(styles[Math.floor(Math.random() * styles.length)]);
    }
    // Check if more machines in route
    else if (currentMachine !== null && currentMachine < routeMachines.length) {
      const nextMachineNum = currentMachine + 1;
      const nextMachine = routeMachines.find(m => m.number === nextMachineNum);

      setCompletedMachines(prev => prev + 1);
      setCurrentMachine(nextMachineNum);
      setCurrentItemIndex(0);

      const nextMachineItems = demoRoutes.filter(
        i => i.route_number === currentRoute && i.machine_number === nextMachineNum
      );

      if (nextMachine && nextMachineItems.length > 0) {
        const firstItem = nextMachineItems[0];
        await speakResponse(`Nice work! Moving to ${nextMachine.name}. First item: ${firstItem.item_quantity} ${firstItem.item_name}, slot ${firstItem.slot_number}`);
      }
    }
    // Route complete - check for more routes or end demo
    else {
      setCompletedMachines(prev => prev + 1);

      // For demo, we'll just complete after route 1 to keep it short
      // In full demo, would check for route 2
      setDemoComplete(true);
      setShowExitPopup(true);

      // Update demo progress in database
      if (demoUser?.email) {
        await supabase
          .from('demo_leads')
          .update({
            demo_completed: true,
            items_completed: completedItems.length + 1,
            machines_completed: completedMachines + 1,
            updated_at: new Date().toISOString()
          })
          .eq('email', demoUser.email);
      }

      await speakResponse(`That's it, ${demoUser?.firstName}! You just picked ${completedItems.length + 1} items across ${completedMachines + 1} machines using only your voice. Zero screen touches needed. Ready to try it with your real routes?`);
    }

    processingRef.current = false;
  }, [getCurrentItem, getMachineItems, getRouteMachines, currentItemIndex, currentMachine, currentRoute, demoRoutes, completedItems, completedMachines, demoUser, speakResponse, clearStuckTimer]);

  // Sync handleNext to ref
  useEffect(() => { handleNextRef.current = handleNext; }, [handleNext]);

  // Handle voice transcript - uses refs to avoid stale closures
  const handleTranscript = useCallback(async (transcript: string, isFinal: boolean) => {
    if (!isFinal || processingRef.current) return;

    const lower = transcript.toLowerCase().trim();
    const v = voiceRef.current;

    // Check for start trigger (before demo starts) - USE REF
    if (!demoStartedRef.current) {
      const startPhrases = ['stocker start', 'start my route', 'start route', 'start', 'lets go', "let's go", 'begin', 'ready'];
      if (startPhrases.some(phrase => lower.includes(phrase))) {
        await handleStartDemoRef.current?.();
        return;
      }
      return;
    }

    // Handle next/confirmation commands
    const nextPhrases = ['next', 'done', 'got it', 'okay', 'ok', 'yep', 'yes', 'yeah', 'yup', 'check', 'good', 'cool', 'great', 'perfect', 'ready'];
    if (nextPhrases.some(phrase => lower.includes(phrase))) {
      await handleNextRef.current?.();
      return;
    }

    // Handle help
    if (lower.includes('help') || lower.includes('what do i say')) {
      await speakResponse('Say "next" when you\'ve grabbed the item. Say "stop" to end the demo.');
      return;
    }

    // Handle stop/end - IMMEDIATELY stop all audio
    if (lower.includes('stop') || lower.includes('end demo') || lower.includes('quit')) {
      v?.stopAudio();
      v?.stopListening();
      setShowExitPopup(true);
      return;
    }

    // Unknown command - be helpful
    await speakResponse("I didn't catch that. Say next when you've grabbed the item.");
  }, [speakResponse]); // Only speakResponse needed - handlers called via refs

  // Handle wake phrase
  const handleWakePhrase = useCallback(async (command: string | null) => {
    const v = voiceRef.current;
    v?.unmute();

    if (command && command !== "what's next") {
      await handleTranscript(command, true);
    } else {
      const currentItem = getCurrentItem();
      if (currentItem) {
        await speakResponse(`Current item: ${currentItem.item_quantity} ${currentItem.item_name}, slot ${currentItem.slot_number}. Say next when ready.`);
      }
    }
  }, [handleTranscript, getCurrentItem, speakResponse]);

  // Initialize voice
  const voice = useVoice({
    onTranscript: handleTranscript,
    onError: (err) => console.error('Voice error:', err),
    onWakePhrase: handleWakePhrase,
    continuous: true
  });

  // Store voice ref
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  // Start voice on mount
  useEffect(() => {
    if (demoUser && !isLoading && demoRoutes.length > 0) {
      voice.startListening();

      // Initial greeting - wait for "Stocker, start my route!"
      setTimeout(async () => {
        await speakResponse(`Hi ${demoUser.firstName}! Say "Stocker, start my route" to begin the demo.`);
      }, 500);
    }

    return () => {
      voice.stopListening();
      voice.stopAudio();
    };
  }, [demoUser, isLoading, demoRoutes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Loading state
  if (isLoading || !demoUser) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  const currentItem = getCurrentItem();
  const statusColors: Record<string, string> = {
    idle: 'bg-gray-500',
    listening: 'bg-green-500 animate-pulse',
    speaking: 'bg-yellow-500',
    thinking: 'bg-purple-500 animate-pulse',
    paused: 'bg-orange-500',
    muted: 'bg-red-500',
    error: 'bg-red-500'
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0d1117] via-[#161b22] to-[#0d1117] text-white flex flex-col">
      {/* Exit Popup */}
      {showExitPopup && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#161b22] rounded-2xl border border-gray-700 p-6 max-w-md w-full">
            <button
              onClick={() => setShowExitPopup(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>

            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {demoComplete ? 'Demo Complete!' : 'Wait! Check This Out...'}
              </h2>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-[#0d1117] rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-emerald-400">{completedItems.length}</p>
                <p className="text-xs text-gray-400">Items Picked</p>
              </div>
              <div className="bg-[#0d1117] rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-emerald-400">{completedMachines}</p>
                <p className="text-xs text-gray-400">Machines</p>
              </div>
              <div className="bg-[#0d1117] rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-emerald-400">0</p>
                <p className="text-xs text-gray-400">Screen Taps</p>
              </div>
            </div>

            {/* Discount Offer */}
            <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6">
              <p className="text-center text-primary font-semibold mb-1">
                You EARNED 2 extra weeks free!
              </p>
              <p className="text-center text-sm text-gray-400">
                Use code <span className="font-mono text-white">{demoUser.discountCode || 'DEMO-BONUS'}</span> at signup
              </p>
              <p className="text-center text-xs text-gray-500 mt-2">
                Standard 2 weeks + 2 bonus weeks = 1 month free trial
              </p>
            </div>

            <Link to="/signup" className="block w-full">
              <Button className="w-full h-14 text-lg font-bold bg-emerald-600 hover:bg-emerald-700 rounded-xl">
                Start My Free Month
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>

            <button
              onClick={() => setShowExitPopup(false)}
              className="w-full text-gray-500 hover:text-gray-300 text-sm mt-4"
            >
              Keep exploring the demo
            </button>
          </div>
        </div>
      )}

      {/* Mic Permission Warning */}
      {micPermission === 'denied' && (
        <div className="bg-red-600 text-white py-3 px-4 flex items-center justify-center gap-3">
          <MicOff className="h-5 w-5" />
          <span className="font-medium">Microphone blocked! Enable it in browser settings.</span>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex-1">
          <span className="text-xs text-emerald-400 font-semibold uppercase">Demo Mode</span>
          <h1 className="text-lg font-semibold">
            {currentItem ? currentItem.route_name : `Hi, ${demoUser.firstName}!`}
          </h1>
        </div>
        <div className="flex-shrink-0 mx-4">
          <img src="/stocker-ai-logo.jpg" alt="Stocker AI" className="h-12 w-12 rounded-full shadow-lg shadow-teal-500/20" />
        </div>
        <div className="flex-1 flex items-center justify-end gap-2">
          {currentItem && (
            <span className="text-sm text-gray-400">
              Machine {currentMachine}/3
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              voice.stopAudio();
              voice.stopListening();
              setShowExitPopup(true);
            }}
            className="text-gray-400"
          >
            End Demo
          </Button>
        </div>
      </header>

      {/* Progress Bar */}
      {demoStarted && (
        <div className="px-4 py-2 bg-[#0d1117]">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>{completedItems.length} items picked</span>
            <span>Machine {currentMachine} of 3</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(5, (completedItems.length / 21) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden pb-20">
        {/* Pre-start instructions */}
        {!demoStarted && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="bg-[#161b22] rounded-2xl border border-gray-700 p-6 max-w-sm w-full">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mic className="h-10 w-10 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Ready, {demoUser.firstName}?</h2>
              <p className="text-gray-400 mb-6">
                Say these commands OUT LOUD to control Stocker:
              </p>

              <div className="space-y-3 text-left mb-6">
                <div className="flex items-center gap-3 p-3 bg-[#0d1117] rounded-lg">
                  <Volume2 className="h-5 w-5 text-emerald-400" />
                  <span className="text-white font-medium">"Stocker, start my route!"</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-[#0d1117] rounded-lg">
                  <Volume2 className="h-5 w-5 text-emerald-400" />
                  <span className="text-white font-medium">"Next"</span>
                  <span className="text-gray-500 text-sm">- after picking item</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-[#0d1117] rounded-lg">
                  <Volume2 className="h-5 w-5 text-emerald-400" />
                  <span className="text-white font-medium">"Done"</span>
                  <span className="text-gray-500 text-sm">- same as next</span>
                </div>
              </div>

              <p className="text-xs text-gray-500 mb-4">
                Works best with earbuds in a quiet space
              </p>

              <div className="flex items-center justify-center gap-2">
                <div className={cn("w-3 h-3 rounded-full", statusColors[voice.status])} />
                <span className="text-sm text-gray-400 capitalize">{voice.status}</span>
              </div>
            </div>
          </div>
        )}

        {/* Active demo view */}
        {demoStarted && (
          <>
            {/* Current Item Card */}
            <div className={cn(
              "bg-[#161b22] rounded-xl p-4 border border-gray-800",
              currentItem && voice.status === 'listening' && "border-emerald-500/50 shadow-lg shadow-emerald-500/20"
            )}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-400 font-semibold uppercase">Pick Item</span>
                {currentItem && voice.status === 'listening' && (
                  <span className="text-xs text-emerald-400 animate-pulse">Say "next" when done</span>
                )}
              </div>
              {currentItem ? (
                <div className="mt-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-emerald-400">{currentItem.item_quantity}x</span>
                    <span className="text-2xl">{currentItem.item_name}</span>
                  </div>
                  <div className="text-lg text-gray-300 mt-2">Slot {currentItem.slot_number}</div>
                  <div className="text-sm text-gray-500 mt-1">{currentItem.machine_name} - {currentItem.machine_location}</div>
                </div>
              ) : demoComplete ? (
                <div className="mt-4 text-center text-emerald-400">
                  <CheckCircle className="h-12 w-12 mx-auto mb-2" />
                  <p className="text-xl font-bold">Demo Complete!</p>
                </div>
              ) : null}
            </div>

            {/* Voice Status + Controls */}
            <div className="bg-[#161b22] rounded-xl p-4 border border-gray-800">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs text-amber-400 font-semibold uppercase">Mic</span>
                <div className={cn("w-3 h-3 rounded-full", statusColors[voice.status])} />
                <span className="text-sm text-gray-400 capitalize">{voice.status}</span>
                {voice.lastInput && (
                  <span className="text-sm text-amber-400 ml-auto truncate max-w-[50%]">"{voice.lastInput}"</span>
                )}
              </div>

              {/* Control buttons row */}
              <div className="flex gap-2">
                {/* Hidden Next button - only shows after 10 seconds stuck */}
                {showNextButton && voice.status === 'listening' && (
                  <Button
                    onClick={handleNext}
                    variant="ghost"
                    className="flex-1 text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-600"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Tap if voice stuck
                  </Button>
                )}

                {/* Always visible STOP button */}
                <Button
                  onClick={() => {
                    voice.stopAudio();
                    voice.stopListening();
                    setShowExitPopup(true);
                  }}
                  variant="ghost"
                  className={cn(
                    "text-red-400 hover:text-red-300 border border-red-900/50 hover:border-red-700 hover:bg-red-950/30",
                    showNextButton ? "" : "w-full"
                  )}
                >
                  <X className="h-4 w-4 mr-2" />
                  Stop Demo
                </Button>
              </div>
            </div>

            {/* AI Response */}
            <div className="bg-[#161b22] rounded-xl p-4 border border-gray-800">
              <span className="text-xs text-purple-400 font-semibold uppercase">Stocker AI Says</span>
              <p className={cn("mt-2", aiResponse ? "text-white" : "text-gray-500 italic")}>
                {aiResponse || 'Waiting for command...'}
              </p>
            </div>

            {/* Completed Items */}
            <div className="bg-[#161b22] rounded-xl border border-gray-800 flex-1 overflow-hidden flex flex-col">
              <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
                <span className="text-xs text-gray-400 font-semibold uppercase">Done</span>
                <span className="text-xs text-gray-500">{completedItems.length} items</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {completedItems.length === 0 ? (
                  <p className="text-gray-500 text-center">No items picked yet</p>
                ) : (
                  <div className="space-y-2">
                    {[...completedItems].reverse().map((item, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm text-gray-400">
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                        <span>{item.item_quantity}x</span>
                        <span className="flex-1 truncate">{item.item_name}</span>
                        <span className="text-gray-500">{item.slot_number}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Quick command hints footer */}
      {demoStarted && !demoComplete && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#0d1117] border-t border-gray-800 py-3 px-4">
          <div className="flex justify-center gap-4 text-xs text-gray-500">
            <span>Say: <span className="text-emerald-400">"next"</span> or <span className="text-emerald-400">"done"</span></span>
            <span>|</span>
            <span>Say: <span className="text-amber-400">"help"</span> for options</span>
          </div>
        </div>
      )}
    </div>
  );
}
