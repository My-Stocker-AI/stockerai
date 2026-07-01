import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mic, MicOff, Volume2, CheckCircle, X, Loader2, ArrowRight, ChevronDown, ChevronUp, RotateCcw, MapPin } from 'lucide-react';
import { useVoice } from '@/hooks/useVoice';
import { CommandRecognizer, PickingCommand } from '@/utils/commandRecognizer';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DiagnosticOverlay } from '@/components/DiagnosticOverlay';

// Ship demo voice events to the SAME diagnostic pipe the main app uses
// (window 'voice-diagnostic' -> DiagnosticOverlay -> POST /api/diag -> Render logs)
// so a desktop or phone demo failure is READABLE in the logs, never guessed at.
const demoLog = (type: string, data?: unknown) => {
  try { window.dispatchEvent(new CustomEvent('voice-diagnostic', { detail: { type, data } })); } catch { /* noop */ }
};

// Real command matcher — the demo used to hand-roll `lower.includes(...)`, which collided
// "skip machine" with the "how many / inventory" responses (both contain "machine") and made
// "how many left" unreliable. For the STOCKING phase we now route through the same
// CommandRecognizer the production app uses (anchored patterns + phonetic/fuzzy correction),
// which disambiguates these cleanly. One shared instance (matches StockerApp.tsx). The
// welcome / route-select / direction-select phases keep the demo's own matching — the
// recognizer doesn't know "start my route" or route names like "Downtown"/"Hospital".
const demoCommandRecognizer = new CommandRecognizer();

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

interface CompletedMachine {
  machineNumber: number;
  machineName: string;
  machineLocation: string;
  items: DemoItem[];
}

type DemoPhase = 'welcome' | 'route_select' | 'direction_select' | 'stocking' | 'mid_cta' | 'complete';

// Guided discovery prompt triggers - appear earlier so users learn commands faster
// Coaching prompts. Each entry is the STATIC lead-in (encouragement / wow line) that is
// preserved verbatim. The command-suggestion portion is now DYNAMIC (see pickCommandTip):
// it only ever suggests a command the driver hasn't used yet, so we never coach a command
// they've already done. MACHINE_1_DONE is a pure wow line with no command tip — untouched.
const DISCOVERY_PROMPTS = {
  ITEM_1: "Great! Remember: say 'next' after each item.",
  ITEM_2: "Nice!",
  ITEM_4: "Perfect!",
  MACHINE_1_DONE: "Machine done! Notice you didn't touch your screen once? That's the whole point.",
  MACHINE_2_ITEM_1: "Got it."
};

// Teachable commands, in the priority order they should be suggested. "next" is deliberately
// excluded — it's used constantly and isn't a teachable tip. The dynamic picker walks this
// list and suggests the first one the driver hasn't invoked yet.
const COMMAND_TIPS: { key: 'how_many_left' | 'skip_machine' | 'go_back'; tip: string }[] = [
  { key: 'how_many_left', tip: "Try 'how many left' to check your progress anytime." },
  { key: 'skip_machine', tip: "Say 'skip machine' if you need to come back to one later." },
  { key: 'go_back', tip: "You can say 'go back' to undo the last item." },
];

export default function DemoLive() {
  const navigate = useNavigate();

  // Core state
  const [demoUser, setDemoUser] = useState<DemoUser | null>(null);
  const [demoRoutes, setDemoRoutes] = useState<DemoItem[]>([]);
  const [phase, setPhase] = useState<DemoPhase>('welcome');
  const [currentRoute, setCurrentRoute] = useState<number>(1);
  const [currentMachine, setCurrentMachine] = useState<number>(1);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [machineDirection, setMachineDirection] = useState<'top' | 'bottom' | null>(null);

  // Tracking state
  const [completedMachines, setCompletedMachines] = useState<CompletedMachine[]>([]);
  const [currentMachineItems, setCurrentMachineItems] = useState<DemoItem[]>([]);
  const [skippedMachines, setSkippedMachines] = useState<number[]>([]);
  const [itemHistory, setItemHistory] = useState<{ route: number; machine: number; index: number }[]>([]);
  const [totalItemsCompleted, setTotalItemsCompleted] = useState(0);

  // UI state
  const [aiResponse, setAiResponse] = useState('');
  const [showExitPopup, setShowExitPopup] = useState(false);
  const [showMidCTA, setShowMidCTA] = useState(false);
  const [showNextButton, setShowNextButton] = useState(false);
  const [stuckTimer, setStuckTimer] = useState<NodeJS.Timeout | null>(null);
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied' | 'checking'>('checking');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedMachines, setExpandedMachines] = useState<number[]>([]);

  // Refs
  const processingRef = useRef(false);
  const voiceRef = useRef<any>(null);
  const discoveryShownRef = useRef<Set<string>>(new Set());
  // DYNAMIC COACHING: which teachable commands the driver has actually invoked. A command is
  // added here the moment its handler successfully fires, so the coaching picker never
  // re-suggests something already done. (Reset per route in handleStartRoute2, like discovery.)
  const usedCommandsRef = useRef<Set<'how_many_left' | 'skip_machine' | 'go_back'>>(new Set());
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  // SELF-HEARING GUARD (FIX 4): true for the entire duration a response is playing. The open
  // mic hears the AI's own voice and Deepgram emits phantom final transcripts (15-21 per long
  // response in the device logs), which stole the driver's next words and caused dual-voice
  // overlap. The demo doesn't need barge-in (the real app dropped it), so we simply ignore any
  // transcript that arrives while this is set. It flips off the instant playback ends, so the
  // driver's real next command (spoken after the AI stops) is honored immediately. This is a
  // demo-local, synchronous ref — no dependency on the hook's React status (which lags a render).
  const isSpeakingRef = useRef(false);

  // Sync state to refs for voice callbacks
  const phaseRef = useRef(phase);
  const currentRouteRef = useRef(currentRoute);
  const currentMachineRef = useRef(currentMachine);
  const currentItemIndexRef = useRef(currentItemIndex);
  const demoRoutesRef = useRef<DemoItem[]>([]);
  const demoUserRef = useRef<DemoUser | null>(null);
  const currentMachineItemsRef = useRef<DemoItem[]>([]);
  const completedMachinesRef = useRef<CompletedMachine[]>([]);
  const totalItemsCompletedRef = useRef(0);
  const skippedMachinesRef = useRef<number[]>([]);
  const itemHistoryRef = useRef<{ route: number; machine: number; index: number }[]>([]);
  const showMidCTARef = useRef(false);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { currentRouteRef.current = currentRoute; }, [currentRoute]);
  useEffect(() => { currentMachineRef.current = currentMachine; }, [currentMachine]);
  useEffect(() => { currentItemIndexRef.current = currentItemIndex; }, [currentItemIndex]);
  useEffect(() => { demoRoutesRef.current = demoRoutes; }, [demoRoutes]);
  useEffect(() => { demoUserRef.current = demoUser; }, [demoUser]);
  useEffect(() => { currentMachineItemsRef.current = currentMachineItems; }, [currentMachineItems]);
  useEffect(() => { completedMachinesRef.current = completedMachines; }, [completedMachines]);
  useEffect(() => { totalItemsCompletedRef.current = totalItemsCompleted; }, [totalItemsCompleted]);
  useEffect(() => { skippedMachinesRef.current = skippedMachines; }, [skippedMachines]);
  useEffect(() => { itemHistoryRef.current = itemHistory; }, [itemHistory]);
  useEffect(() => { showMidCTARef.current = showMidCTA; }, [showMidCTA]);

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
    // One-shot environment snapshot — desktop vs mobile + capability gaps, so a silent
    // failure is explained by the logs (e.g. desktop, no secure context, missing API).
    demoLog('demo-env', {
      ua: navigator.userAgent,
      mobile: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent),
      secureContext: window.isSecureContext,
      hasGetUserMedia: !!navigator.mediaDevices?.getUserMedia,
      hasAudioContext: !!(window.AudioContext || (window as any).webkitAudioContext),
      hasWebSocket: typeof WebSocket !== 'undefined',
      hasWebLocks: 'locks' in navigator,
    });
    const checkMicPermission = async () => {
      try {
        if (navigator.permissions) {
          const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          setMicPermission(result.state as 'prompt' | 'granted' | 'denied');
          demoLog('demo-mic-permission', { state: result.state });
          result.onchange = () => { setMicPermission(result.state as 'prompt' | 'granted' | 'denied'); demoLog('demo-mic-permission', { state: result.state, changed: true }); };
        } else {
          setMicPermission('prompt');
          demoLog('demo-mic-permission', { state: 'prompt', note: 'permissions API unavailable' });
        }
      } catch (e: any) {
        setMicPermission('prompt');
        demoLog('demo-mic-permission', { state: 'prompt', error: String(e?.message || e) });
      }
    };
    checkMicPermission();
  }, []);

  // beforeunload handler
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (phase !== 'welcome' && phase !== 'complete') {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [phase]);

  // Wake lock to keep screen on during demo
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && phase !== 'welcome' && phase !== 'complete') {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('[Demo] Wake lock acquired - screen will stay on');

          wakeLockRef.current.addEventListener('release', () => {
            console.log('[Demo] Wake lock released');
          });
        } catch (err) {
          console.log('[Demo] Wake lock failed:', err);
        }
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };

    // Request wake lock when actively using demo
    if (phase !== 'welcome' && phase !== 'complete') {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    // Re-acquire wake lock when page becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && phase !== 'welcome' && phase !== 'complete') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      releaseWakeLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [phase]);

  // Helper: Get items for a specific route and machine
  const getMachineItems = useCallback((route: number, machine: number) => {
    return demoRoutes.filter(
      item => item.route_number === route && item.machine_number === machine
    );
  }, [demoRoutes]);

  // Helper: Get unique machines for a route
  const getRouteMachines = useCallback((route: number) => {
    const machines = demoRoutes
      .filter(item => item.route_number === route)
      .map(item => ({ number: item.machine_number, name: item.machine_name, location: item.machine_location }));
    return [...new Map(machines.map(m => [m.number, m])).values()];
  }, [demoRoutes]);

  // Helper: Get unique routes
  const getUniqueRoutes = useCallback(() => {
    const routes = demoRoutes.map(item => ({ number: item.route_number, name: item.route_name }));
    return [...new Map(routes.map(r => [r.number, r])).values()];
  }, [demoRoutes]);

  // Clear stuck timer
  const clearStuckTimer = useCallback(() => {
    if (stuckTimer) {
      clearTimeout(stuckTimer);
      setStuckTimer(null);
    }
    setShowNextButton(false);
  }, [stuckTimer]);

  // Start stuck timer (show Next button after 10 seconds)
  const startStuckTimer = useCallback(() => {
    clearStuckTimer();
    const timer = setTimeout(() => {
      setShowNextButton(true);
    }, 10000);
    setStuckTimer(timer);
  }, [clearStuckTimer]);

  // Speak response
  const speakResponse = useCallback(async (text: string, startTimer = true) => {
    setAiResponse(text);
    const v = voiceRef.current;
    if (v) {
      // ONE-TURN-LAG FIX: mark the hook 'thinking' the instant we start speaking, so any
      // utterance the driver speaks while this response plays is QUEUED and drained
      // deterministically (mirrors StockerApp.tsx:452) instead of racing the status flips
      // and landing one command behind. This is the SINGLE chokepoint every spoken response
      // flows through, so only paths that actually speak go 'thinking'; speak() then drives
      // status back to 'listening' on completion (and in its finally), so no path is left
      // stuck in 'thinking'. Non-speaking returns in handleTranscript never reach here.
      v.setThinking?.();
      // FIX 4: raise the self-hearing guard for the WHOLE playback window so phantom
      // transcripts (the mic hearing the AI) are ignored in handleTranscript. Released in
      // finally so an error can never leave the demo permanently deaf.
      isSpeakingRef.current = true;
      try {
        await v.speak(text);
      } finally {
        isSpeakingRef.current = false;
      }
      // SAFETY NET — guarantees no path is left stuck in 'thinking' (which would queue the
      // next command and re-create the lag). When speak() runs normally it has already
      // returned status to 'listening' by the time this await resolves, so re-asserting
      // 'listening' here is a no-op on the happy path. But speak() has early-return paths
      // that exit BEFORE setting any status (empty text, stoppedRef set by an exit, or the
      // single-voice lock suppressing a non-owning instance); on those it would leave us in
      // 'thinking'. Unconditionally asserting 'listening' after the await closes every one
      // of those paths. (If the user exited, stoppedRef is set and voice is being torn down,
      // so the status no longer matters.)
      v.setStatus?.('listening');
    }
    if (startTimer) {
      startStuckTimer();
    }
  }, [startStuckTimer]);

  // Get current item
  const getCurrentItem = useCallback((): DemoItem | null => {
    return currentMachineItems[currentItemIndex] || null;
  }, [currentMachineItems, currentItemIndex]);

  // ========== PHASE HANDLERS ==========

  // Handle route selection voice command
  const handleRouteSelection = useCallback(async (routeChoice: 'downtown' | 'hospital') => {
    const routeNum = routeChoice === 'downtown' ? 1 : 2;
    const routeName = routeChoice === 'downtown' ? 'Downtown Office' : 'Hospital Campus';

    setCurrentRoute(routeNum);
    setPhase('direction_select');
    setCurrentMachine(1);

    const machines = getRouteMachines(routeNum);
    const firstMachine = machines[0];

    await speakResponse(
      `Great choice! ${routeName}. Starting with ${firstMachine?.name}. Start at the top or the bottom of the list?`,
      true
    );
  }, [getRouteMachines, speakResponse]);

  // Handle direction selection
  const handleDirectionSelection = useCallback(async (direction: 'top' | 'bottom') => {
    setMachineDirection(direction);
    setPhase('stocking');

    let items = getMachineItems(currentRoute, currentMachine);
    if (direction === 'bottom') {
      items = [...items].reverse();
    }

    setCurrentMachineItems(items);
    setCurrentItemIndex(0);

    const firstItem = items[0];
    if (firstItem) {
      await speakResponse(
        `Starting from the ${direction}. Your first item: ${firstItem.item_quantity} ${firstItem.item_name}, slot ${firstItem.slot_number}. Say "next" when you've grabbed it!`
      );
    }
  }, [currentRoute, currentMachine, getMachineItems, speakResponse]);

  // Pick the highest-priority command the driver has NOT used yet (how many left → skip
  // machine → go back). Returns a leading-space tip to append, or '' if all three are used
  // (suppress — don't nag). Logs the choice so the logs prove only-unused commands are coached.
  const pickCommandTip = useCallback((): string => {
    const next = COMMAND_TIPS.find(c => !usedCommandsRef.current.has(c.key));
    demoLog('demo-tip', { suggested: next ? next.key : null });
    return next ? ' ' + next.tip : '';
  }, []);

  // Handle next item (main progression)
  const handleNext = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    clearStuckTimer();

    const v = voiceRef.current;
    const currentItem = currentMachineItemsRef.current[currentItemIndexRef.current];
    const route = currentRouteRef.current;
    const machine = currentMachineRef.current;
    const itemIdx = currentItemIndexRef.current;
    const machineItems = currentMachineItemsRef.current;
    const routes = demoRoutesRef.current;
    const user = demoUserRef.current;

    if (!currentItem) {
      processingRef.current = false;
      return;
    }

    // Save to history for go-back
    setItemHistory(prev => [...prev, { route, machine, index: itemIdx }]);

    // Update completed count
    setTotalItemsCompleted(prev => prev + 1);
    const newTotal = totalItemsCompletedRef.current + 1;

    // Track this item as completed in current machine
    setCurrentMachineItems(prev => prev.map((item, i) =>
      i === itemIdx ? { ...item, _completed: true } as any : item
    ));

    v?.playSuccessBeep();

    // Check for guided discovery prompts - appear earlier so users learn commands faster
    const machineItemCount = itemIdx + 1; // 1-indexed count within this machine
    const totalMachineItems = machineItems.length;
    let extraPrompt = '';

    // Static lead-in + DYNAMIC command tip (only an unused command, or nothing if all used).
    // Item 1 (first item user picks) - remind them of key commands
    if (newTotal === 1 && !discoveryShownRef.current.has('ITEM_1')) {
      discoveryShownRef.current.add('ITEM_1');
      extraPrompt = ' ' + DISCOVERY_PROMPTS.ITEM_1 + pickCommandTip();
    }
    // Item 2 - command tip
    else if (newTotal === 2 && !discoveryShownRef.current.has('ITEM_2')) {
      discoveryShownRef.current.add('ITEM_2');
      extraPrompt = ' ' + DISCOVERY_PROMPTS.ITEM_2 + pickCommandTip();
    }
    // Item 4 - command tip
    else if (newTotal === 4 && !discoveryShownRef.current.has('ITEM_4')) {
      discoveryShownRef.current.add('ITEM_4');
      extraPrompt = ' ' + DISCOVERY_PROMPTS.ITEM_4 + pickCommandTip();
    }
    // Machine 2, item 1 - command tip (earlier than before)
    else if (machine === 2 && machineItemCount === 1 && !discoveryShownRef.current.has('MACHINE_2_ITEM_1')) {
      discoveryShownRef.current.add('MACHINE_2_ITEM_1');
      extraPrompt = ' ' + DISCOVERY_PROMPTS.MACHINE_2_ITEM_1 + pickCommandTip();
    }

    // Check if more items in current machine
    if (itemIdx < machineItems.length - 1) {
      const newIndex = itemIdx + 1;
      setCurrentItemIndex(newIndex);
      const nextItem = machineItems[newIndex];

      const styles = [
        `${nextItem.item_quantity} ${nextItem.item_name}, slot ${nextItem.slot_number}.${extraPrompt}`,
        `Next up, ${nextItem.item_quantity} ${nextItem.item_name}, slot ${nextItem.slot_number}.${extraPrompt}`,
        `Grab ${nextItem.item_quantity} ${nextItem.item_name} for slot ${nextItem.slot_number}.${extraPrompt}`,
        `Got it! ${nextItem.item_quantity} ${nextItem.item_name}, slot ${nextItem.slot_number}.${extraPrompt}`,
      ];
      await speakResponse(styles[Math.floor(Math.random() * styles.length)]);
    }
    // Machine complete - move to next machine
    else {
      // Save completed machine
      const completedItems = machineItems.filter((_, i) => i <= itemIdx);
      const machineInfo = routes.find(i => i.route_number === route && i.machine_number === machine);

      setCompletedMachines(prev => [...prev, {
        machineNumber: machine,
        machineName: machineInfo?.machine_name || `Machine ${machine}`,
        machineLocation: machineInfo?.machine_location || '',
        items: completedItems
      }]);

      const routeMachines = getRouteMachines(route);
      const nextMachineNum = machine + 1;

      // Machine 1 done prompt
      if (machine === 1 && !discoveryShownRef.current.has('MACHINE_1_DONE')) {
        discoveryShownRef.current.add('MACHINE_1_DONE');
        extraPrompt = ' ' + DISCOVERY_PROMPTS.MACHINE_1_DONE;
      }

      // Check if more machines in this route
      if (nextMachineNum <= routeMachines.length) {
        const nextMachine = routeMachines.find(m => m.number === nextMachineNum);

        setCurrentMachine(nextMachineNum);
        setPhase('direction_select');
        setMachineDirection(null);
        setCurrentItemIndex(0);
        setCurrentMachineItems([]);

        await speakResponse(
          `${extraPrompt ? extraPrompt + ' ' : ''}Moving to ${nextMachine?.name}. Start at the top or the bottom of the list?`
        );
      }
      // Route complete
      else {
        // Check if this is Route 1 - show mid-CTA
        if (route === 1) {
          setShowMidCTA(true);
          await speakResponse(
            `Amazing work, ${user?.firstName}! First route done — ${newTotal} items, completely hands-free. Ready for the real thing, or want to try Route 2?`,
            false
          );
        } else {
          // Route 2 complete - demo finished
          setPhase('complete');
          setShowExitPopup(true);

          // Update demo progress
          if (user?.email) {
            await supabase
              .from('demo_leads')
              .update({
                demo_completed: true,
                items_completed: newTotal,
                machines_completed: completedMachinesRef.current.length + 1,
                updated_at: new Date().toISOString()
              })
              .eq('email', user.email);
          }

          await speakResponse(
            `Incredible, ${user?.firstName}! ${newTotal} items across both routes, all by voice. Zero screen touches.`,
            false
          );
        }
      }
    }

    processingRef.current = false;
  }, [clearStuckTimer, getRouteMachines, speakResponse, pickCommandTip]);

  // Handle "how many left?" command - items left to PICK (progress)
  const handleHowManyLeft = useCallback(async () => {
    usedCommandsRef.current.add('how_many_left'); // dynamic-coaching: don't re-suggest this
    const machineItems = currentMachineItemsRef.current;
    const itemIdx = currentItemIndexRef.current;
    const machine = currentMachineRef.current;
    const route = currentRouteRef.current;

    const itemsRemaining = machineItems.length - itemIdx;
    const machines = getRouteMachines(route);
    const machinesRemaining = machines.length - machine;

    let response = `${itemsRemaining} left on this machine.`;
    if (machinesRemaining > 0) {
      response += ` Then ${machinesRemaining} more machine${machinesRemaining > 1 ? 's' : ''}.`;
    } else {
      response += ` Last machine on the route!`;
    }

    await speakResponse(response);
  }, [getRouteMachines, speakResponse]);

  // Handle "inventory count" command - par level / what's in the machine
  const handleInventoryCount = useCallback(async () => {
    const item = currentMachineItemsRef.current[currentItemIndexRef.current];
    if (item) {
      // Demo doesn't have real inventory data, so explain what this would show
      await speakResponse(
        `In the full app, I'd tell you how many ${item.item_name} are currently in the machine versus its capacity. This helps you know if the machine is running low.`
      );
    } else {
      await speakResponse("No current item to check inventory for.");
    }
  }, [speakResponse]);

  // Handle "skip machine" command
  const handleSkipMachine = useCallback(async () => {
    usedCommandsRef.current.add('skip_machine'); // dynamic-coaching: don't re-suggest this
    const machine = currentMachineRef.current;
    const route = currentRouteRef.current;

    setSkippedMachines(prev => [...prev, machine]);

    const routeMachines = getRouteMachines(route);
    const nextMachineNum = machine + 1;

    if (nextMachineNum <= routeMachines.length) {
      const nextMachine = routeMachines.find(m => m.number === nextMachineNum);

      setCurrentMachine(nextMachineNum);
      setPhase('direction_select');
      setMachineDirection(null);
      setCurrentItemIndex(0);
      setCurrentMachineItems([]);

      await speakResponse(
        `No problem, we'll come back to it. Moving to ${nextMachine?.name}. Start at the top or the bottom of the list?`
      );
    } else {
      // No more machines - check for skipped ones
      if (skippedMachinesRef.current.length > 0) {
        const firstSkipped = skippedMachinesRef.current[0];
        const skippedMachine = routeMachines.find(m => m.number === firstSkipped);

        setSkippedMachines(prev => prev.filter(m => m !== firstSkipped));
        setCurrentMachine(firstSkipped);
        setPhase('direction_select');
        setMachineDirection(null);
        setCurrentItemIndex(0);
        setCurrentMachineItems([]);

        await speakResponse(
          `Let's circle back to ${skippedMachine?.name}. Start at the top or the bottom of the list?`
        );
      } else {
        // Route complete with skip
        await speakResponse(`That's the last machine. Route complete!`, false);
        setPhase('complete');
        setShowExitPopup(true);
      }
    }
  }, [getRouteMachines, speakResponse]);

  // Handle "go back" command
  const handleGoBack = useCallback(async () => {
    usedCommandsRef.current.add('go_back'); // dynamic-coaching: don't re-suggest this
    const history = itemHistoryRef.current;

    if (history.length === 0) {
      await speakResponse("Nothing to undo — you're at the beginning.");
      return;
    }

    const lastItem = history[history.length - 1];
    setItemHistory(prev => prev.slice(0, -1));
    setTotalItemsCompleted(prev => Math.max(0, prev - 1));

    // If we're on same machine, just go back one item
    if (lastItem.machine === currentMachineRef.current) {
      setCurrentItemIndex(lastItem.index);
      const item = currentMachineItemsRef.current[lastItem.index];
      if (item) {
        await speakResponse(`Going back. ${item.item_quantity} ${item.item_name}, slot ${item.slot_number}.`);
      }
    } else {
      // Need to restore previous machine state
      await speakResponse("Undone. Say 'next' to continue from where you were.");
    }
  }, [speakResponse]);

  // Handle starting Route 2 (after mid-CTA)
  const handleStartRoute2 = useCallback(async () => {
    setShowMidCTA(false);
    setCurrentRoute(2);
    setCurrentMachine(1);
    setPhase('direction_select');
    setMachineDirection(null);
    setCurrentItemIndex(0);
    setCurrentMachineItems([]);
    setCompletedMachines([]);
    discoveryShownRef.current.clear();
    usedCommandsRef.current.clear(); // fresh coaching for Route 2, matching discovery reset

    const machines = getRouteMachines(2);
    const firstMachine = machines[0];

    await speakResponse(
      `Alright, let's do this! Route 2: Hospital Campus. Starting with ${firstMachine?.name}. Start at the top or the bottom of the list?`
    );
  }, [getRouteMachines, speakResponse]);

  // ========== VOICE HANDLER ==========

  const handleTranscript = useCallback(async (transcript: string, isFinal: boolean) => {
    if (!isFinal || processingRef.current) return;

    const lower = transcript.toLowerCase().trim();
    const v = voiceRef.current;
    const currentPhase = phaseRef.current;

    // Handle stop/end at any time — must work even mid-response, so it sits ABOVE the
    // self-hearing guard (the driver can always kill the demo).
    if (lower.includes('stop') || lower.includes('end demo') || lower.includes('quit')) {
      v?.stopAudio();
      v?.stopListening();
      setShowExitPopup(true);
      return;
    }

    // FIX 4: while a response is playing, ignore transcripts — they are almost always the mic
    // hearing the AI's own voice (phantom finals), not the driver. The guard drops the instant
    // playback ends, so the driver's real next command (spoken after the AI stops) is honored.
    if (isSpeakingRef.current) {
      demoLog('demo-self-hearing-ignored', transcript);
      return;
    }

    // Handle mid-CTA "continue" command
    if (showMidCTARef.current && (lower.includes('continue') || lower.includes('route 2') || lower.includes('keep going'))) {
      await handleStartRoute2();
      return;
    }

    // Welcome phase - wait for start trigger
    if (currentPhase === 'welcome') {
      const startPhrases = ['stocker start', 'start my route', 'start route', 'start', 'lets go', "let's go", 'begin', 'ready'];
      if (startPhrases.some(phrase => lower.includes(phrase))) {
        setPhase('route_select');
        const routes = getUniqueRoutes();
        await speakResponse(
          `Awesome! Let's pick a route. Say "Downtown" for ${routes[0]?.name || 'Route 1'}, or "Hospital" for ${routes[1]?.name || 'Route 2'}.`,
          true
        );
      }
      return;
    }

    // Route selection phase
    if (currentPhase === 'route_select') {
      if (lower.includes('downtown') || lower.includes('office') || lower.includes('one') || lower.includes('first')) {
        await handleRouteSelection('downtown');
      } else if (lower.includes('hospital') || lower.includes('campus') || lower.includes('two') || lower.includes('second')) {
        await handleRouteSelection('hospital');
      } else {
        await speakResponse('Say "Downtown" for Route 1, or "Hospital" for Route 2.');
      }
      return;
    }

    // Direction selection phase - also handle common commands here
    if (currentPhase === 'direction_select') {
      if (lower.includes('top')) {
        await handleDirectionSelection('top');
      } else if (lower.includes('bottom')) {
        await handleDirectionSelection('bottom');
      } else if (lower.includes('how many') || lower.includes('left') || lower.includes('remaining')) {
        // Let user ask how many items to pick before starting
        const items = getMachineItems(currentRouteRef.current, currentMachineRef.current);
        const machines = getRouteMachines(currentRouteRef.current);
        const machinesRemaining = machines.length - currentMachineRef.current + 1;
        await speakResponse(
          `${items.length} items on this machine, ${machinesRemaining} machine${machinesRemaining > 1 ? 's' : ''} on the route. Start at the top or the bottom of the list?`
        );
      } else if (lower.includes('inventory') || lower.includes('par level') || lower.includes('capacity')) {
        await speakResponse(
          `Inventory info is available once you start stocking. Say top or bottom to begin.`
        );
      } else if (lower.includes('skip') && lower.includes('machine')) {
        // Allow skipping during direction selection too
        await handleSkipMachine();
      } else if (lower.includes('help') || lower.includes('commands')) {
        await speakResponse(
          'Say "top" or "bottom" to start. You can also ask "how many left" or "skip machine". Once stocking, say "next" after each item.'
        );
      } else {
        await speakResponse('Top or bottom for this machine?');
      }
      return;
    }

    // Stocking phase - main commands.
    // ROUTE THROUGH THE REAL RECOGNIZER (FIX 1): the old `includes()` matcher collided
    // "skip machine" with the inventory/how-many responses (both contain "machine") and made
    // "how many left" flaky. CommandRecognizer uses anchored patterns and checks skip BEFORE
    // inventory, so it disambiguates cleanly and also phonetically corrects Deepgram errors.
    if (currentPhase === 'stocking') {
      // "help" has no recognizer command — keep the demo's own escape hatch first.
      if (lower.includes('help') || lower.includes('what do i say') || lower.includes('commands')) {
        await speakResponse(
          'Say "next" when done. "How many left" for progress. "Inventory" for stock levels. "Skip machine" to skip. "Go back" to undo.'
        );
        return;
      }

      const match = demoCommandRecognizer.recognize(transcript);
      // FIX 3: prove in the logs that a recognized stocking command was actually routed to a
      // handler (never silently swallowed). Every branch below speaks, so there is no
      // dead no-response path.
      demoLog('demo-stocking-command', { transcript, command: match.command, confidence: match.confidence });

      switch (match.command) {
        case PickingCommand.NEXT_ITEM:
        case PickingCommand.AFFIRMATIVE:
          await handleNext();
          return;

        case PickingCommand.SKIP_MACHINE:
          await handleSkipMachine();
          return;

        case PickingCommand.INVENTORY_QUERY: {
          // The recognizer returns one type for both "how many left" (picking progress) and
          // "inventory / par level" (machine stock). Keep the demo's two distinct handlers by
          // splitting on the driver's actual words.
          const asksProgress = /\b(how many|left|remaining|progress)\b/.test(lower);
          if (asksProgress) {
            await handleHowManyLeft();
          } else {
            await handleInventoryCount();
          }
          return;
        }

        case PickingCommand.GO_BACK:
        case PickingCommand.PREVIOUS_ITEM:
        case PickingCommand.UNDO:
          await handleGoBack();
          return;

        case PickingCommand.REPEAT: {
          const item = currentMachineItemsRef.current[currentItemIndexRef.current];
          if (item) {
            await speakResponse(`${item.item_quantity} ${item.item_name}, slot ${item.slot_number}.`);
          } else {
            await speakResponse("Say 'next' when you've grabbed the item.");
          }
          return;
        }

        // direction_top / direction_bottom aren't valid mid-stocking; fall through to unknown.
        default:
          // Unknown command — still always responds (never a dead drop).
          await speakResponse("I didn't catch that. Say 'next' when you've grabbed the item, or 'help' for options.");
          return;
      }
    }
  }, [getUniqueRoutes, handleRouteSelection, handleDirectionSelection, handleNext, handleInventoryCount, handleHowManyLeft, handleSkipMachine, handleGoBack, speakResponse]);

  // Handle wake phrase
  const handleWakePhrase = useCallback(async (command: string | null) => {
    const v = voiceRef.current;
    v?.unmute();

    if (command && command !== "what's next") {
      await handleTranscript(command, true);
    } else {
      const item = currentMachineItems[currentItemIndex];
      if (item) {
        await speakResponse(`${item.item_quantity} ${item.item_name}, slot ${item.slot_number}. Say next when ready.`);
      }
    }
  }, [handleTranscript, currentMachineItems, currentItemIndex, speakResponse]);

  // Initialize voice
  const voice = useVoice({
    onTranscript: handleTranscript,
    onError: (err) => { console.error('Voice error:', err); demoLog('demo-voice-error', { message: String(err) }); },
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
      demoLog('demo-start-listening', { calling: true });
      Promise.resolve(voice.startListening())
        .then((ok) => demoLog('demo-start-listening-result', { ok }))
        .catch((e) => demoLog('demo-start-listening-result', { ok: false, error: String(e?.message || e) }));

      setTimeout(async () => {
        await speakResponse(
          `Hi ${demoUser.firstName}! Welcome to Stocker. Say "start my route" when you're ready to begin.`,
          false
        );
      }, 500);
    }

    return () => {
      voice.stopListening();
      voice.stopAudio();
    };
  }, [demoUser, isLoading, demoRoutes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle machine expansion in completed list
  const toggleMachineExpand = (machineNum: number) => {
    setExpandedMachines(prev =>
      prev.includes(machineNum)
        ? prev.filter(m => m !== machineNum)
        : [...prev, machineNum]
    );
  };

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

  const routes = getUniqueRoutes();
  const routeMachines = getRouteMachines(currentRoute);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0d1117] via-[#161b22] to-[#0d1117] text-white flex flex-col">

      {/* Diagnostics: auto-ships every voice event to /api/diag so demo failures are
          readable in the logs. Triple-tap the status dot reveals it on-device. */}
      <DiagnosticOverlay
        voiceStatus={voice.status}
        isDeepgramConnected={voice.isDeepgramConnected}
        isVisible={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
      />

      {/* Mid-Demo CTA Popup (After Route 1) */}
      {showMidCTA && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#161b22] rounded-2xl border border-gray-700 p-6 max-w-md w-full">
            <div className="text-center mb-6">
              <div className="text-4xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-white mb-2">Nice Work!</h2>
              <p className="text-gray-400">
                You just completed Route 1 — {totalItemsCompleted} items picked completely hands-free.
              </p>
            </div>

            <div className="space-y-3">
              <Link to="/signup" className="block w-full">
                <Button className="w-full h-14 text-lg font-bold bg-emerald-600 hover:bg-emerald-700 rounded-xl">
                  Start Free Trial — 1 Month FREE
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>

              <Button
                onClick={handleStartRoute2}
                variant="outline"
                className="w-full h-12 border-gray-600 hover:bg-gray-800"
              >
                Continue to Route 2
              </Button>
            </div>

            <div className="flex justify-between mt-4">
              <p className="text-xs text-gray-500">
                Or say "Continue" to keep going
              </p>
              <Link to="/" className="text-xs text-gray-500 hover:text-gray-300">
                Return to website
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Exit Popup */}
      {showExitPopup && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#161b22] rounded-2xl border border-gray-700 p-6 max-w-md w-full relative">
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
                {phase === 'complete' ? 'YOU EARNED IT! 🎉' : 'Great Progress!'}
              </h2>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-[#0d1117] rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-emerald-400">{totalItemsCompleted}</p>
                <p className="text-xs text-gray-400">Items Picked</p>
              </div>
              <div className="bg-[#0d1117] rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-emerald-400">{completedMachines.length}</p>
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
                🎁 You EARNED 2 extra weeks free!
              </p>
              <p className="text-center text-sm text-gray-400">
                Code: <span className="font-mono text-white">{demoUser.discountCode || 'DEMO-BONUS'}</span>
              </p>
              <p className="text-center text-xs text-gray-500 mt-2">
                Standard 2 weeks + 2 bonus = 1 month free trial
              </p>
            </div>

            <Link to="/signup" className="block w-full">
              <Button className="w-full h-14 text-lg font-bold bg-emerald-600 hover:bg-emerald-700 rounded-xl">
                Claim My Free Month
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>

            <div className="flex justify-between mt-4">
              <button
                onClick={() => setShowExitPopup(false)}
                className="text-gray-500 hover:text-gray-300 text-sm"
              >
                Keep exploring the demo
              </button>
              <Link to="/" className="text-gray-500 hover:text-gray-300 text-sm">
                Return to website
              </Link>
            </div>
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
            {phase === 'stocking' && currentItem
              ? routes.find(r => r.number === currentRoute)?.name
              : `Hi, ${demoUser.firstName}!`}
          </h1>
        </div>
        <div className="flex-shrink-0 mx-4">
          <img src="/stocker-ai-logo.jpg" alt="Stocker AI" className="h-12 w-12 rounded-full shadow-lg shadow-teal-500/20" />
        </div>
        <div className="flex-1 flex items-center justify-end gap-2">
          {phase === 'stocking' && (
            <span className="text-sm text-gray-400">
              Machine {currentMachine}/{routeMachines.length}
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
            className="text-red-400 hover:text-red-300"
          >
            End Demo
          </Button>
        </div>
      </header>

      {/* Progress Bar */}
      {phase === 'stocking' && (
        <div className="px-4 py-2 bg-[#0d1117]">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>{totalItemsCompleted} items picked</span>
            <span>Route {currentRoute} • Machine {currentMachine}</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(5, (totalItemsCompleted / 21) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden pb-24">
        {/* Welcome Phase */}
        {phase === 'welcome' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="bg-[#161b22] rounded-2xl border border-gray-700 p-6 max-w-sm w-full">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mic className="h-10 w-10 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Ready, {demoUser.firstName}?</h2>
              <p className="text-gray-400 mb-6">
                Experience hands-free stocking. Say these commands OUT LOUD:
              </p>

              <div className="space-y-3 text-left mb-6">
                <div className="flex items-center gap-3 p-3 bg-[#0d1117] rounded-lg">
                  <Volume2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  <span className="text-white font-medium">"Start my route!"</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-[#0d1117] rounded-lg">
                  <Volume2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  <span className="text-white">"Next"</span>
                  <span className="text-gray-500 text-sm ml-auto">advance</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-[#0d1117] rounded-lg">
                  <Volume2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  <span className="text-white">"How many left?"</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-[#0d1117] rounded-lg">
                  <Volume2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  <span className="text-white">"Skip machine"</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-[#0d1117] rounded-lg">
                  <Volume2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  <span className="text-white">"Go back"</span>
                  <span className="text-gray-500 text-sm ml-auto">undo</span>
                </div>
              </div>

              <p className="text-xs text-gray-500 mb-4">
                🎧 Works best with earbuds in a quiet space
              </p>

              <div className="flex items-center justify-center gap-2">
                <div className={cn("w-3 h-3 rounded-full", statusColors[voice.status])} />
                <span className="text-sm text-gray-400 capitalize">{voice.status}</span>
              </div>
            </div>
          </div>
        )}

        {/* Route Selection Phase */}
        {phase === 'route_select' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="bg-[#161b22] rounded-2xl border border-gray-700 p-6 max-w-sm w-full">
              <h2 className="text-xl font-bold text-white mb-4">Pick a Route</h2>
              <p className="text-gray-400 mb-6">Say "Downtown" or "Hospital"</p>

              <div className="space-y-3">
                {routes.map((route) => (
                  <button
                    key={route.number}
                    onClick={() => handleRouteSelection(route.number === 1 ? 'downtown' : 'hospital')}
                    className="w-full p-4 bg-[#0d1117] rounded-xl border border-gray-700 hover:border-emerald-500 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <MapPin className="h-5 w-5 text-emerald-400" />
                      <div>
                        <p className="font-semibold text-white">{route.name}</p>
                        <p className="text-sm text-gray-500">3 machines • 21 items</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Direction Selection Phase */}
        {phase === 'direction_select' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="bg-[#161b22] rounded-2xl border border-gray-700 p-6 max-w-sm w-full">
              <h2 className="text-xl font-bold text-white mb-2">
                {routeMachines.find(m => m.number === currentMachine)?.name}
              </h2>
              <p className="text-gray-500 text-sm mb-4">
                {routeMachines.find(m => m.number === currentMachine)?.location}
              </p>
              <p className="text-gray-400 mb-6">Start from top or bottom?</p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleDirectionSelection('top')}
                  className="p-4 bg-[#0d1117] rounded-xl border border-gray-700 hover:border-emerald-500 transition-colors"
                >
                  <ChevronUp className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                  <p className="font-semibold text-white">Top</p>
                </button>
                <button
                  onClick={() => handleDirectionSelection('bottom')}
                  className="p-4 bg-[#0d1117] rounded-xl border border-gray-700 hover:border-emerald-500 transition-colors"
                >
                  <ChevronDown className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                  <p className="font-semibold text-white">Bottom</p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stocking Phase */}
        {phase === 'stocking' && (
          <>
            {/* Current Item Card */}
            <div className={cn(
              "bg-[#161b22] rounded-xl p-4 border border-gray-800",
              currentItem && voice.status === 'listening' && "border-emerald-500/50 shadow-lg shadow-emerald-500/20"
            )}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-400 font-semibold uppercase">Pick Item</span>
                {voice.status === 'listening' && (
                  <span className="text-xs text-emerald-400 animate-pulse">Listening...</span>
                )}
              </div>
              {currentItem ? (
                <div className="mt-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-emerald-400">{currentItem.item_quantity}x</span>
                    <span className="text-2xl">{currentItem.item_name}</span>
                  </div>
                  <div className="text-lg text-gray-300 mt-2">Slot {currentItem.slot_number}</div>
                  <div className="text-sm text-gray-500 mt-1">{currentItem.machine_name}</div>
                </div>
              ) : (
                <div className="mt-4 text-center text-gray-500">
                  Loading item...
                </div>
              )}
            </div>

            {/* Voice Status */}
            <div className="bg-[#161b22] rounded-xl p-4 border border-gray-800">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs text-amber-400 font-semibold uppercase">Mic</span>
                <div className={cn("w-3 h-3 rounded-full", statusColors[voice.status])} />
                <span className="text-sm text-gray-400 capitalize">{voice.status}</span>
                {voice.lastInput && (
                  <span className="text-sm text-amber-400 ml-auto truncate max-w-[50%]">"{voice.lastInput}"</span>
                )}
              </div>

              <div className="flex gap-2">
                {showNextButton && (
                  <Button
                    onClick={handleNext}
                    variant="ghost"
                    className="flex-1 text-gray-500 hover:text-gray-300 border border-gray-700"
                  >
                    Tap if voice stuck
                  </Button>
                )}
                <Button
                  onClick={() => {
                    voice.stopAudio();
                    voice.stopListening();
                    setShowExitPopup(true);
                  }}
                  variant="ghost"
                  className={cn(
                    "text-red-400 hover:text-red-300 border border-red-900/50 hover:bg-red-950/30",
                    !showNextButton && "w-full"
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

            {/* Completed Machines - Grouped */}
            {completedMachines.length > 0 && (
              <div className="bg-[#161b22] rounded-xl border border-gray-800 flex-1 overflow-hidden flex flex-col">
                <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-semibold uppercase">Completed</span>
                  <span className="text-xs text-gray-500">{totalItemsCompleted} items</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {completedMachines.map((machine) => (
                    <div key={machine.machineNumber} className="border-b border-gray-800 last:border-0">
                      <button
                        onClick={() => toggleMachineExpand(machine.machineNumber)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/50"
                      >
                        <div className="flex items-center gap-3">
                          <CheckCircle className="h-5 w-5 text-emerald-500" />
                          <div className="text-left">
                            <p className="font-medium text-white">{machine.machineName}</p>
                            <p className="text-xs text-gray-500">{machine.items.length} items</p>
                          </div>
                        </div>
                        <ChevronDown className={cn(
                          "h-4 w-4 text-gray-400 transition-transform",
                          expandedMachines.includes(machine.machineNumber) && "rotate-180"
                        )} />
                      </button>

                      {expandedMachines.includes(machine.machineNumber) && (
                        <div className="px-4 pb-3 space-y-1">
                          {machine.items.map((item, i) => (
                            <div key={i} className="flex items-center gap-3 text-sm text-gray-400 pl-8">
                              <span className="text-emerald-400">{item.item_quantity}x</span>
                              <span className="flex-1 truncate">{item.item_name}</span>
                              <span className="text-gray-600">{item.slot_number}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Command hints footer */}
      {phase === 'stocking' && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#0d1117] border-t border-gray-800 py-3 px-4">
          <div className="flex justify-center gap-2 flex-wrap text-xs text-gray-500">
            <span><span className="text-emerald-400">"next"</span></span>
            <span>•</span>
            <span><span className="text-emerald-400">"how many left"</span></span>
            <span>•</span>
            <span><span className="text-emerald-400">"skip machine"</span></span>
            <span>•</span>
            <span><span className="text-emerald-400">"go back"</span></span>
          </div>
        </div>
      )}
    </div>
  );
}
