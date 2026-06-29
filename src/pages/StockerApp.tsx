import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Mic, MicOff, Pause, Play, Square, AlertTriangle, RefreshCw, HelpCircle, Zap, MapPin, Package, Truck, RotateCcw, Settings } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useVoice } from '@/hooks/useVoice';
import { useStockerAI } from '@/hooks/useStockerAI';
import { useStockerSession } from '@/hooks/useStockerSession';
import { useSessionPersistence } from '@/hooks/useSessionPersistence';
import { useKeywordLearning } from '@/hooks/useKeywordLearning';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HelpSheet } from '@/components/stocker/HelpSheet';
import { SettingsSheet } from '@/components/stocker/SettingsSheet';
import { useEnvironmentDetection } from '@/hooks/useEnvironmentDetection';
import { RouteSelectionCard } from '@/components/stocker/RouteSelectionCard';
import { MachineListPanel } from '@/components/stocker/MachineListPanel';
import { DiagnosticOverlay } from '@/components/DiagnosticOverlay';
import { CommandRecognizer, PickingCommand } from '@/utils/commandRecognizer';
import { validateTextSource, requiresWorkflowSpoken } from '@/utils/contractValidation';
import type { WorkflowAction } from '@/types/contracts';

// Route info for selection cards
interface RouteOption {
  id: string;
  route_name: string;
  machines: number;
  items: number;
  machine_names: string[];
}

// Route verification - check if route still exists (from original PWA)
async function verifyRouteExists(userId: string, routeName: string, routeDate: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('routes')
      .select('id')
      .eq('user_id', userId)
      .eq('route_name', routeName)
      .eq('delivery_date', routeDate)
      .single();

    return !error && !!data;
  } catch (e) {
    console.log('[Stocker] Route verification error:', e);
    return false;
  }
}

// Conversation sanitization (from original PWA)
function sanitizeConversationHistory(history: any[]): any[] {
  if (!history || !Array.isArray(history)) return [];

  const sanitized: any[] = [];
  const pendingToolCallIds = new Set<string>();

  for (const msg of history) {
    if (msg.role === 'system' || msg.role === 'user') {
      sanitized.push(msg);
      pendingToolCallIds.clear();
    } else if (msg.role === 'assistant') {
      sanitized.push(msg);
      pendingToolCallIds.clear();
      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          pendingToolCallIds.add(tc.id);
        }
      }
    } else if (msg.role === 'tool') {
      if (msg.tool_call_id && pendingToolCallIds.has(msg.tool_call_id)) {
        sanitized.push(msg);
        pendingToolCallIds.delete(msg.tool_call_id);
      }
    }
  }

  // Remove assistant messages with unresolved tool_calls
  if (pendingToolCallIds.size > 0) {
    for (let i = sanitized.length - 1; i >= 0; i--) {
      if (sanitized[i].role === 'assistant' && sanitized[i].tool_calls) {
        sanitized.splice(i, 1);
        break;
      }
    }
  }

  return sanitized;
}

// Trim conversation history to prevent memory growth (from original PWA)
const MAX_MESSAGES = 30;
function trimConversationHistory(history: any[]): any[] {
  if (!history || history.length <= MAX_MESSAGES) return history;

  const trimmed = [...history];
  while (trimmed.length > MAX_MESSAGES) {
    // Find first non-system message to remove
    let removed = false;
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i].role !== 'system') {
        // If it's an assistant with tool_calls, also remove the following tool messages
        if (trimmed[i].role === 'assistant' && trimmed[i].tool_calls) {
          const toolCallIds = new Set(trimmed[i].tool_calls.map((tc: any) => tc.id));
          trimmed.splice(i, 1);
          // Remove corresponding tool messages
          for (let j = i; j < trimmed.length; ) {
            if (trimmed[j].role === 'tool' && toolCallIds.has(trimmed[j].tool_call_id)) {
              trimmed.splice(j, 1);
            } else {
              j++;
            }
          }
        } else {
          trimmed.splice(i, 1);
        }
        removed = true;
        break;
      }
    }
    if (!removed) break; // All system messages, stop
  }
  return trimmed;
}

// Command recognizer instance for pattern matching high-frequency commands
const commandRecognizer = new CommandRecognizer();

// One row of the Done list. Memoized on primitive props so that picking an item
// re-renders only the new row, not all (up to ~269) rows — fixes the late-route
// scroll stutter on slower Android phones.
const DoneItem = memo(function DoneItem({
  quantity, product, slot, showMachineSeparator, prevMachineName,
}: {
  quantity: number; product: string; slot: string;
  showMachineSeparator: boolean; prevMachineName?: string;
}) {
  return (
    <div>
      {showMachineSeparator && (
        <div className="flex items-center gap-2 py-2 my-1">
          <div className="flex-1 h-px bg-teal-600/50" />
          <span className="text-xs text-teal-400 font-medium px-2">{prevMachineName} ✓</span>
          <div className="flex-1 h-px bg-teal-600/50" />
        </div>
      )}
      <div className="flex items-center gap-3 text-sm text-gray-400">
        <CheckCircle className="h-4 w-4 text-emerald-500" />
        <span>{quantity}x</span>
        <span className="flex-1 truncate">{product}</span>
        <span className="text-gray-500">{slot}</span>
      </div>
    </div>
  );
});

export default function StockerApp() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const routeIdFromUrl = searchParams.get('route'); // Get route ID from URL
  const { user, userProfile, loading } = useAuth();
  const [aiResponse, setAiResponse] = useState('');
  const [lastItemPair, setLastItemPair] = useState<{
    spokenText: string;
    item1?: any;
    item2?: any;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showMicHelp, setShowMicHelp] = useState(false);
  const [showHelpSheet, setShowHelpSheet] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [savedSession, setSavedSession] = useState<any>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied' | 'checking'>('checking');
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [showRouteSelection, setShowRouteSelection] = useState(false);
  const [availableRoutes, setAvailableRoutes] = useState<RouteOption[]>([]);
  const [routeKeywords, setRouteKeywords] = useState<string[]>([]);
  const [learnedKeywords, setLearnedKeywords] = useState<string[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [routeSelectionDate, setRouteSelectionDate] = useState<string>('');
  const [urlRouteProcessed, setUrlRouteProcessed] = useState(false); // Track if URL route was processed
  const [showPWAWarning, setShowPWAWarning] = useState(false);
  const processingRef = useRef(false);
  const initStartedRef = useRef(false); // Prevent double initialization
  const lastRouteIdRef = useRef<string | null>(null); // Track last processed route ID
  const MAX_RETRIES = 2;
  const voiceRef = useRef<any>(null); // Ref to hold voice methods for callbacks

  // Detect iOS/Safari for tap instruction
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  // Detect iOS PWA mode (standalone) - getUserMedia() is broken in iOS PWA
  const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                (window.navigator as any).standalone === true;

  const userName = userProfile?.first_name || 'there';
  const userId = user?.id || null;

  const { routeState, sessionId, messages, messagesRef, updateFromTool, addMessage, reset, setRouteState, setMessages, setSessionId, generateNewSessionId } = useStockerSession(userId);
  const { setSession, sendToAI, executeToolCalls, getRoutes } = useStockerAI();
  const sessionPersistence = useSessionPersistence();
  const keywordLearning = useKeywordLearning();

  // Save session state whenever route changes
  const saveSessionState = useCallback(async () => {
    // FIX: Don't save if we're in the middle of clearing
    if (isClearing) {
      console.log('[Session] Save blocked - clearing in progress');
      return;
    }

    if (!routeState.routeName || !userId) return;

    const sessionData = {
      sessionId,
      userId,
      routeId: routeState.routeId,
      routeName: routeState.routeName,
      routeDate: routeState.routeDate,
      totalMachines: routeState.totalMachines,
      currentMachineIndex: routeState.currentMachineIndex,
      currentMachineId: routeState.currentMachineId,
      currentMachineName: routeState.currentMachineName,
      currentMachineTotalItems: routeState.currentMachineTotalItems,
      currentMachineItemsRemaining: routeState.currentMachineItemsRemaining,
      currentItem: routeState.currentItem,
      currentItem2: routeState.currentItem2,
      completedItems: routeState.completedItems,
      machines: routeState.machines,  // CRITICAL FIX: Save per-machine progress
      completed: routeState.completed,
      conversationHistory: messages,
      pendingMachineTransition: routeState.pendingMachineTransition,
      pickDirection: routeState.pickDirection
    };

    await sessionPersistence.save(sessionData, userId);
  }, [routeState, sessionId, messages, userId, sessionPersistence, isClearing]);

  // Save on route state changes
  useEffect(() => {
    if (routeState.routeName) {
      saveSessionState();
    }
  }, [routeState, saveSessionState]);

  // Undo last item - local handler (from original PWA)
  const undoLastItem = useCallback(() => {
    if (routeState.completedItems.length === 0) {
      return { success: false, message: "Nothing to undo - no completed items" };
    }

    const lastItem = routeState.completedItems[routeState.completedItems.length - 1];
    const newCompleted = routeState.completedItems.slice(0, -1);

    setRouteState({
      ...routeState,
      currentItem: lastItem,
      completedItems: newCompleted,
      completed: false
    });

    voiceRef.current?.playErrorBeep();
    return {
      success: true,
      message: `Going back to ${lastItem.quantity} ${lastItem.product}, ${lastItem.slot_spoken || lastItem.slot}`,
      item: lastItem
    };
  }, [routeState, setRouteState]);

  // Handle route selection (voice or tap) - defined before handleTranscript
  // This is called AFTER the initial greeting, so we just trigger the route start silently
  const selectRoute = useCallback(async (routeName: string, dateForRoute?: string) => {
    setSelectedRoute(routeName);
    // DON'T hide route selection yet - wait for first item to load
    // Store the date if provided, so triggerRouteStart can use it
    if (dateForRoute) {
      (window as any).__routeStartDate = dateForRoute;
    }
    // Don't announce here - the initial greeting already introduced the route
    // The triggerRouteStart effect will handle sending the command to the AI
  }, []);

  const handleTranscript = useCallback(async (transcript: string, isFinal: boolean) => {
    if (!isFinal || processingRef.current) return;
    const v = voiceRef.current;
    if (!v) return;

    // CRITICAL FIX: Ignore all transcripts while TTS is speaking
    // Prevents items from being skipped if user interrupts before TTS completes
    // Bug: Session updates before TTS plays, so interrupting skips items
    if (voiceRef.current?.status === 'speaking') {
      console.log('[Voice] Ignoring transcript while speaking:', transcript);
      return;
    }

    // Drop stale commands once the session is invalidated — e.g. a command queued
    // during the final "route complete" announcement replaying a beat later. Without
    // this, undo/repeat/next could execute out-of-sequence on a finished route. The
    // deeper tool-execution guards (below) already cover the AI path; this closes the
    // local-command path. Starting the next route runs through selectRoute, not here,
    // so this never blocks a fresh route.
    if (routeState.sessionInvalidated) {
      console.log('[Voice] Ignoring transcript — session invalidated:', transcript);
      return;
    }

    const lower = transcript.toLowerCase().trim();

    // Handle voice pause/mute/continue commands locally (from original PWA)
    if (lower === 'pause' || lower === 'stop listening') {
      v.pauseListening();
      return;
    }
    if (lower === 'mute' || lower === 'mute mic' || lower === 'mute microphone') {
      v.mute();
      return;
    }
    if ((lower === 'continue' || lower === 'resume' || lower === 'start listening') && voice.status === 'idle') {
      voice.startListening();
      setAiResponse('Resumed. Say "OK Stocker" for commands.');
      return;
    }

    // Handle undo commands locally (from original PWA)
    const undoWords = ['go back', 'undo', 'oops', 'wait no', 'previous', 'back one', 'wrong', 'mistake'];
    const isUndo = undoWords.some(w => lower.indexOf(w) !== -1);

    if (isUndo && routeState.routeName) {
      processingRef.current = true;
      const result = undoLastItem();
      setAiResponse(result.message);
      await v.speak(result.message);
      // Track undo as failure (user correcting AI)
      await keywordLearning.trackKeywords(transcript, false);
      processingRef.current = false;
      return;
    }

    // Handle repeat commands - repeat last AI response
    const repeatWords = ['repeat', 'again', 'what was that', 'say that again', 'say again', 'what\'s next', 'current'];
    const isRepeat = repeatWords.some(w => lower.indexOf(w) !== -1);

    if (isRepeat) {
      processingRef.current = true;

      // Check if 2-item mode is enabled
      const twoItemMode = localStorage.getItem('stocker-call-two-items') === 'true';

      // Priority 1: Use lastItemPair if available (supports 2-item mode)
      if (lastItemPair && lastItemPair.spokenText) {
        await v.speak(lastItemPair.spokenText);
        console.log('[Repeat] Using lastItemPair:', twoItemMode ? '2-item mode' : '1-item mode', lastItemPair.spokenText);
      }
      // Priority 2: Use last AI response
      else if (aiResponse) {
        await v.speak(aiResponse);
        console.log('[Repeat] Using aiResponse:', aiResponse);
      }
      // Priority 3: Build response from current item
      else if (routeState.currentItem) {
        const item = routeState.currentItem;
        const msg = `${item.quantity} ${item.product}${item.slot_spoken ? ', ' + item.slot_spoken : ''}`;
        await v.speak(msg);
        setAiResponse(msg);
        console.log('[Repeat] Built from currentItem:', msg);
      }
      // Fallback: Nothing to repeat
      else {
        const msg = "I haven't said anything yet.";
        await v.speak(msg);
        setAiResponse(msg);
      }

      // Track repeat as failure (user didn't understand)
      await keywordLearning.trackKeywords(transcript, false);
      processingRef.current = false;
      return;
    }

    // PHONETIC CORRECTION: Fix common mishearings when awaiting direction
    // Problem: Deepgram transcribes "bottom" as "bam", "bomb", etc.
    // Solution: Client-side phonetic matching - ZERO LATENCY
    let correctedTranscript = transcript;
    if (routeState.pendingMachineTransition) {
      const { detectDirection } = await import('../utils/phoneticCorrection');
      const detectedDirection = detectDirection(transcript);
      if (detectedDirection) {
        correctedTranscript = detectedDirection;
        console.log('[PhoneticCorrection] 🔧 Corrected transcript:', {
          original: transcript,
          corrected: correctedTranscript,
          direction: detectedDirection
        });
      }
    }

    // COMMAND RECOGNITION LAYER: Pattern matching for high-frequency commands
    // This bypasses AI for 90% of commands, achieving <1s response time and 99.9% accuracy
    // Only active when user is on a route (not during route selection)
    if (routeState.routeName) {
      console.log('[CommandRecognizer] 🎤 Transcript received:', transcript);
      const commandMatch = commandRecognizer.recognize(correctedTranscript);
      console.log('[CommandRecognizer] 🔍 Recognition result:', {
        command: commandMatch.command,
        confidence: commandMatch.confidence,
        parameters: commandMatch.parameters
      });

      if (commandMatch.command !== PickingCommand.UNKNOWN && commandMatch.confidence >= 0.7) {
        // CRITICAL FIX: State machine enforcement - check for pending machine transition
        if (routeState.pendingMachineTransition) {
          const isDirectionCommand =
            commandMatch.command === PickingCommand.DIRECTION_TOP ||
            commandMatch.command === PickingCommand.DIRECTION_BOTTOM ||
            commandMatch.command === PickingCommand.AFFIRMATIVE ||
            commandMatch.command === PickingCommand.SKIP_MACHINE;

          console.log('[CommandRecognizer] 🚦 STATE CHECK: pendingMachineTransition exists', {
            command: commandMatch.command,
            isDirectionCommand,
            machine: routeState.pendingMachineTransition.nextMachineName
          });

          if (!isDirectionCommand) {
            console.log('[CommandRecognizer] ❌ BLOCKED - Non-direction command during transition:', commandMatch.command);
            // CRITICAL FIX: Ask for direction, not just "ready to go?"
            // User might be saying "yes" but it's not matching AFFIRMATIVE pattern
            const msg = `Top or bottom for ${routeState.pendingMachineTransition.nextMachineName}?`;
            setAiResponse(msg);
            await v.speak(msg);
            processingRef.current = false;
            return;
          }
          console.log('[CommandRecognizer] ✅ ALLOWED - Direction/affirmative command:', commandMatch.command);
          // Allow direction and affirmative commands to proceed
        }

        console.log('[CommandRecognizer] ✓ Matched:', commandMatch.command, 'confidence:', commandMatch.confidence, '(bypassing AI)');
        processingRef.current = true;
        v.setThinking();

        try {
          // Build OpenAI-format tool call for executeToolCalls
          let toolCalls: any[] = [];

          switch (commandMatch.command) {
            case PickingCommand.NEXT_ITEM:
              toolCalls = [{
                id: `cmd_${Date.now()}`,
                type: 'function',
                function: {
                  name: 'get_next_item',
                  arguments: JSON.stringify({
                    session_id: sessionId,
                    date: routeState.routeDate
                  })
                }
              }];
              break;

            case PickingCommand.SKIP_MACHINE:
              toolCalls = [{
                id: `cmd_${Date.now()}`,
                type: 'function',
                function: {
                  name: 'skip_current_machine',
                  arguments: JSON.stringify({
                    session_id: sessionId
                  })
                }
              }];
              break;

            case PickingCommand.INVENTORY_QUERY: {
              // Handle inventory locally — data is already in state
              const item1 = routeState.currentItem;
              const item2 = routeState.currentItem2;
              let invMsg = '';

              if (item1 && item1.inventory_parlevel !== undefined && item1.inventory_current !== undefined) {
                if (item2 && item2.inventory_parlevel !== undefined && item2.inventory_current !== undefined) {
                  invMsg = `${item1.product}: ${item1.inventory_current} of ${item1.inventory_parlevel} par level. ${item2.product}: ${item2.inventory_current} of ${item2.inventory_parlevel} par level.`;
                } else {
                  invMsg = `${item1.product}: ${item1.inventory_current} of ${item1.inventory_parlevel} par level.`;
                }
              } else {
                invMsg = 'No inventory information available for this item.';
              }

              console.log('[CommandRecognizer] INVENTORY_QUERY answered locally:', invMsg);
              setAiResponse(invMsg);
              await v.speak(invMsg);
              processingRef.current = false;
              return;
            }

            case PickingCommand.REPEAT:
              // Already handled by repeat handler above
              console.log('[CommandRecognizer] REPEAT already handled by repeat handler');
              processingRef.current = false;
              return;

            case PickingCommand.DIRECTION_TOP:
              toolCalls = [{
                id: `cmd_${Date.now()}`,
                type: 'function',
                function: {
                  name: 'start_machine',
                  arguments: JSON.stringify({
                    session_id: sessionId,
                    direction: 'beginning'
                  })
                }
              }];
              break;

            case PickingCommand.DIRECTION_BOTTOM:
              toolCalls = [{
                id: `cmd_${Date.now()}`,
                type: 'function',
                function: {
                  name: 'start_machine',
                  arguments: JSON.stringify({
                    session_id: sessionId,
                    direction: 'end'
                  })
                }
              }];
              break;

            case PickingCommand.GO_BACK:
              toolCalls = [{
                id: `cmd_${Date.now()}`,
                type: 'function',
                function: {
                  name: 'go_back_to_skipped',
                  arguments: JSON.stringify({
                    session_id: sessionId
                  })
                }
              }];
              break;

            case PickingCommand.PREVIOUS_ITEM:
              // Show previous item (same as undo - pops last item back to current)
              const prevResult = undoLastItem();
              setAiResponse(prevResult.message);
              await v.speak(prevResult.message);
              if (prevResult.success) await keywordLearning.trackKeywords(transcript, true);
              processingRef.current = false;
              return;

            case PickingCommand.UNDO:
              // Already handled above via undoLastItem()
              const result = undoLastItem();
              setAiResponse(result.message);
              await v.speak(result.message);
              if (result.success) await keywordLearning.trackKeywords(transcript, true);
              processingRef.current = false;
              return;

            case PickingCommand.AFFIRMATIVE:
              // Affirmative response during machine transition - auto-call start_machine with saved direction
              if (routeState.pendingMachineTransition && routeState.pickDirection) {
                // Map database direction to workflow direction
                const direction = routeState.pickDirection === 'reverse' ? 'end' : 'beginning';

                // Check for 2-pick mode
                const callTwoItems = localStorage.getItem('stocker-call-two-items') === 'true';

                toolCalls = [{
                  id: `cmd_${Date.now()}`,
                  type: 'function',
                  function: {
                    name: 'start_machine',
                    arguments: JSON.stringify({
                      session_id: sessionId,
                      direction: direction,
                      ...(callTwoItems ? { count: 2 } : {})
                    })
                  }
                }];

                console.log('[CommandRecognizer] 🚀 AFFIRMATIVE - Auto-calling start_machine with saved direction:', direction);
              } else if (routeState.pendingMachineTransition && !routeState.pickDirection) {
                // First machine - no direction saved yet, prompt for it
                const msg = `Start from the top or bottom for ${routeState.pendingMachineTransition.nextMachineName}?`;
                setAiResponse(msg);
                await v.speak(msg);
                processingRef.current = false;
                return;
              } else {
                // No pending transition — "yes/okay/ready" during normal picking means "next item"
                toolCalls = [{
                  id: `cmd_${Date.now()}`,
                  type: 'function',
                  function: {
                    name: 'get_next_item',
                    arguments: JSON.stringify({
                      session_id: sessionId
                    })
                  }
                }];
                console.log('[CommandRecognizer] AFFIRMATIVE during normal picking → get_next_item');
              }
              break;
          }

          // Helper: Build display-friendly text (correct spelling) from tool result
          const buildDisplayText = (result: any): string => {
            // OPTION B: Use display_text field if available (new format)
            if (result.display_text) {
              console.log('[Display] Using display_text:', result.display_text);
              return result.display_text;
            }

            // Backwards compatibility: Build from product_name/quantity (old format)
            if (result.action === 'next_item' || result.action === 'item_ready') {
              const parts: string[] = [];

              // Item 1
              if (result.product_name && result.quantity) {
                parts.push(`${result.quantity}× ${result.product_name}`);
              }

              // Item 2 (if present in 2-item mode)
              if (result.item2?.product_name && result.item2?.quantity) {
                parts.push(`${result.item2.quantity}× ${result.item2.product_name}`);
              }

              return parts.join(', ');
            }

            // For other actions, use spoken field (it's correct for those)
            return result.spoken || '';
          };

          // Execute tool calls directly (bypass AI)
          if (toolCalls.length > 0) {
            const toolResults = await executeToolCalls(
              toolCalls,
              (name, result) => {
              updateFromTool(name, result);
              v.playSuccessBeep();

              // Performance Priority 5: Prefetch TTS in parallel
              // Start TTS fetch immediately when result arrives (before speak() is called)
              // OPTION B: Use voice_text if available, fallback to spoken
              const textForTTS = result.voice_text || result.spoken;
              if (textForTTS) {
                v.prefetchTTS(textForTTS);
              }

              // Store last item pair for repeat functionality
              if (name === 'get_next_item' || name === 'start_machine') {
                const spokenText = result.voice_text || result.spoken;
                if (spokenText) {
                  const newItemPair = {
                    spokenText,
                    item1: result.item1 || { product: result.product_name, quantity: result.quantity, slot: result.slot },
                    item2: result.item2 || null
                  };
                  setLastItemPair(newItemPair);
                }
              }
            },
            routeState.sessionInvalidated || routeState.completed  // CATASTROPHIC FAILURE FIX: Prevent commands after completion
          );

            // ============================================================================
            // CONTRACT VALIDATION - AI Text Generation Rules
            // ============================================================================
            // Validate that workflow actions use workflow.spoken (not AI generation)
            for (const tr of toolResults) {
              if (tr.result?.action) {
                const action = tr.result.action as WorkflowAction;
                const hasSpoken = !!(tr.result.voice_text || tr.result.spoken);

                // Validate text source for this action
                const textValidation = validateTextSource(action, hasSpoken);
                if (!textValidation.valid) {
                  console.error('[ContractViolation] AI text generation rule violated:', {
                    action,
                    hasSpoken,
                    errors: textValidation.errors.map(e => e.rule)
                  });
                }

                // CRITICAL: Workflow actions MUST have spoken text
                if (requiresWorkflowSpoken(action) && !hasSpoken) {
                  console.error(`[ContractViolation] ${action} missing workflow.spoken - frontend MUST NOT generate text`);
                }
              }
            }

            // FIX: Clear pendingMachineTransition after start_machine succeeds
            // This prevents "next" commands from being blocked after user says "OK" to start a machine
            for (const tr of toolResults) {
              if (tr.result && !tr.result.error) {
                // Find the tool call that produced this result
                const toolCall = toolCalls.find(tc => tc.id === tr.tool_call_id);
                if (toolCall && toolCall.function.name === 'start_machine') {
                  setRouteState(prev => ({
                    ...prev,
                    pendingMachineTransition: null
                  }));
                  console.log('[CommandRecognizer] ✅ Cleared pendingMachineTransition after start_machine');
                  break; // Only need to clear once
                }
              }
            }

            // Use fast path - speak the workflow's voice_text or spoken field directly
            for (const tr of toolResults) {
              const voiceText = tr.result?.voice_text || tr.result?.spoken;
              if (voiceText) {
                console.log('[Voice] Using voice_text:', tr.result?.voice_text ? 'new format' : 'backwards compat', voiceText);
                setAiResponse(buildDisplayText(tr.result)); // Display uses display_text
                await v.speak(voiceText); // TTS uses voice_text (pronunciation-friendly)
                await keywordLearning.trackKeywords(transcript, true); // Track as success
                processingRef.current = false;
                return;
              }
            }

            // Fallback if no spoken field (CONTRACT VIOLATION - should not happen)
            console.error('[ContractViolation] No spoken field in workflow result - this violates data contracts');
            const fallbackMsg = "Something went wrong. Can you say that again?";
            setAiResponse(fallbackMsg);
            await v.speak(fallbackMsg);
            processingRef.current = false;
            return;
          }
        } catch (err: any) {
          console.error('[CommandRecognizer] Direct execution failed:', err);
          const errorMsg = "Something went wrong. Can you try again?";
          setAiResponse(errorMsg);
          await v.speak(errorMsg);
          processingRef.current = false;
          return;
        }

        processingRef.current = false;
        return; // Never fall through to AI during active picking
      } else {
        // UNKNOWN during active picking — respond locally, do NOT route to AI
        // AI gives confusing state-based responses to unrecognized input (e.g. "Say top or bottom" mid-machine)
        console.log('[CommandRecognizer] ❓ UNKNOWN command during picking:', correctedTranscript);
        let unknownMsg: string;
        if (routeState.pendingMachineTransition) {
          unknownMsg = `I didn't catch that. Say top or bottom for ${routeState.pendingMachineTransition.nextMachineName}.`;
        } else {
          unknownMsg = "I didn't catch that. Can you say that again?";
        }
        setAiResponse(unknownMsg);
        await v.speak(unknownMsg);
        processingRef.current = false;
        return;
      }
    }

    // NO frontend matching - let AI handle ALL route selection
    // AI has semantic understanding that works for ANY route name
    // This scales to thousands of users with arbitrary route names

    processingRef.current = true;
    v.setThinking();

    try {
      // Use corrected transcript (with phonetic fixes) for AI
      addMessage({ role: 'user', content: correctedTranscript });
      // Use messagesRef.current to avoid stale closure (ref is updated immediately by addMessage)
      const allMessages = trimConversationHistory(sanitizeConversationHistory([...messagesRef.current]));

      // Pass route context: either available routes (before selection) or current route (after selection)
      const routeContext = availableRoutes.length > 0 && !routeState.routeName ? {
        // User is choosing from available routes
        availableRoutes: availableRoutes.map(r => r.route_name),
        date: routeSelectionDate,
        currentRouteName: undefined
      } : (routeState.routeName ? {
        // User is on a route - include full state for status queries
        availableRoutes: availableRoutes.map(r => r.route_name), // Cache routes for switch_route
        date: routeState.routeDate || '',
        currentRouteName: routeState.routeName,
        totalMachines: routeState.totalMachines,
        currentMachineIndex: routeState.currentMachineIndex,
        completedItemsCount: routeState.completedItems.length,
        totalItems: routeState.machines.reduce((sum, m) => sum + (m.totalItems || 0), 0),
        machines: routeState.machines, // For skipped machine tracking
        currentItem2: routeState.currentItem2 // CRITICAL FIX: For 2-pick mode par level
      } : undefined);

      let response = await sendToAI(allMessages, userName, routeState.currentItem, routeContext);
      let fastPathVoiceText: string | null = null; // Track voice text separately from display text

      // CRITICAL: Loop while there are tool_calls (matches original PWA behavior)
      // OpenAI can return BOTH content AND tool_calls - we must process all tool_calls first
      while (response.tool_calls?.length) {
        // Add assistant message with tool_calls (content set to null per OpenAI spec)
        addMessage({ role: 'assistant', content: null, tool_calls: response.tool_calls });

        const toolResults = await executeToolCalls(
          response.tool_calls,
          (name, result) => {
            updateFromTool(name, result);
            v.playSuccessBeep(); // Use success beep for item confirmation

            // Performance Priority 5: Prefetch TTS in parallel
            // Start TTS fetch immediately when result arrives (before speak() is called)
            // OPTION B: Use voice_text if available, fallback to spoken
            const textForTTS = result.voice_text || result.spoken;
            if (textForTTS) {
              v.prefetchTTS(textForTTS);
            }

            // Store last item pair for repeat functionality (2-item mode support)
            if (name === 'get_next_item' || name === 'start_machine') {
              const spokenText = result.voice_text || result.spoken;
              if (spokenText) {
                const newItemPair = {
                  spokenText,
                  item1: result.item1 || { product: result.product_name, quantity: result.quantity, slot: result.slot },
                  item2: result.item2 || null
                };
                setLastItemPair(newItemPair);
              }
            }
          },
          routeState.sessionInvalidated || routeState.completed  // CATASTROPHIC FAILURE FIX: Prevent commands after completion
        );

        for (const tr of toolResults) {
          addMessage({ role: 'tool', tool_call_id: tr.tool_call_id, content: JSON.stringify(tr.result) });
        }

        // Helper: Build display-friendly text (correct spelling) from tool result
        const buildDisplayText = (result: any): string => {
          // OPTION B: Use display_text field if available (new format)
          if (result.display_text) {
            console.log('[Display] Using display_text:', result.display_text);
            return result.display_text;
          }

          // Backwards compatibility: Build from product_name/quantity (old format)
          if (result.action === 'next_item' || result.action === 'item_ready') {
            const parts: string[] = [];

            // Item 1
            if (result.product_name && result.quantity) {
              parts.push(`${result.quantity}× ${result.product_name}`);
            }

            // Item 2 (if present in 2-item mode)
            if (result.item2?.product_name && result.item2?.quantity) {
              parts.push(`${result.item2.quantity}× ${result.item2.product_name}`);
            }

            return parts.join(', ');
          }

          // For other actions, use spoken field (it's correct for those)
          return result.spoken || '';
        };

        // Check for fast path - if tool returned voice_text/spoken field, use it directly
        let usedFastPath = false;
        for (const tr of toolResults) {
          const voiceText = tr.result?.voice_text || tr.result?.spoken;
          if (voiceText) {
            console.log('[Voice] AI path using voice_text:', tr.result?.voice_text ? 'new format' : 'backwards compat', voiceText);
            response = { content: buildDisplayText(tr.result) }; // Display uses display_text
            fastPathVoiceText = voiceText; // Store voice text separately
            usedFastPath = true;
            break;
          }
        }

        if (!usedFastPath) {
          // Use messagesRef.current for the follow-up call too
          response = await sendToAI(trimConversationHistory(sanitizeConversationHistory([...messagesRef.current])), userName, routeState.currentItem, routeContext);
        } else {
          break; // Exit loop if using fast path
        }
      }

      if (response.content) {
        setAiResponse(response.content);
        addMessage({ role: 'assistant', content: response.content });
        // OPTION B: Speak voice_text if available (fast path), otherwise speak content
        const textToSpeak = fastPathVoiceText || response.content;
        console.log('[Voice] Speaking:', fastPathVoiceText ? 'voice_text' : 'content', textToSpeak);
        await v.speak(textToSpeak);
        // Track successful AI response (user was understood)
        await keywordLearning.trackKeywords(transcript, true);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Something went wrong';
      const isNetworkError = errorMsg.includes('timeout') ||
                            errorMsg.includes('network') ||
                            errorMsg.includes('fetch') ||
                            errorMsg.includes('Failed to fetch');
      const isRateLimited = errorMsg.includes('429') || errorMsg.includes('rate limit');

      // DETAILED ERROR LOGGING for troubleshooting
      console.error('[Stocker] Command failed:', {
        transcript,
        error: errorMsg,
        errorStack: err.stack,
        isNetworkError,
        isRateLimited,
        retryCount,
        routeState: {
          routeName: routeState.routeName,
          currentItem: routeState.currentItem?.product,
          machineIndex: routeState.currentMachineIndex,
          pendingTransition: routeState.pendingMachineTransition
        }
      });

      // CRITICAL FIX: Clear stuck state on network/tool failures
      if (routeState.pendingMachineTransition && !isNetworkError) {
        // Non-network errors (tool failures, validation errors) should clear transition
        console.log('[Stocker] ⚠️  CLEARING pendingMachineTransition due to non-network error:', errorMsg);
        console.log('[Stocker] 🧹 Pending transition before clear:', routeState.pendingMachineTransition);
        setRouteState(prev => ({
          ...prev,
          pendingMachineTransition: null
        }));
      }
      // Network errors: let retry handler deal with it, don't clear state yet
      else if (routeState.pendingMachineTransition && isNetworkError) {
        console.log('[Stocker] 🌐 NETWORK ERROR - Preserving pendingMachineTransition during retries');
      }

      // Auto-retry on network errors (up to MAX_RETRIES)
      if (isNetworkError && retryCount < MAX_RETRIES) {
        setRetryCount(prev => prev + 1);
        setAiResponse('Connection issue, retrying...');
        console.log(`[Stocker] Retrying (${retryCount + 1}/${MAX_RETRIES})...`);
        // Wait 1 second then retry
        await new Promise(resolve => setTimeout(resolve, 1000));
        processingRef.current = false;
        return handleTranscript(transcript, true);
      }

      // CRITICAL FIX: Clear stuck state after max retries exhausted
      if (isNetworkError && routeState.pendingMachineTransition) {
        console.log('[Stocker] 💀 MAX RETRIES EXHAUSTED - Clearing pendingMachineTransition');
        console.log('[Stocker] 🧹 Pending transition:', routeState.pendingMachineTransition);
        setRouteState(prev => ({
          ...prev,
          pendingMachineTransition: null
        }));
      }

      // Friendly messages for common errors
      let userFriendlyError: string;
      if (isRateLimited) {
        userFriendlyError = 'Service is busy. Please wait a moment and say that again.';
      } else if (isNetworkError) {
        userFriendlyError = 'Connection lost. Check your internet and try again.';
      } else {
        // Show detailed error in development, friendly message in production
        userFriendlyError = `Error: ${errorMsg}. Triple-tap for details.`;
      }

      setError(userFriendlyError);
      setRetryCount(0); // Reset retry count on final failure
      v.playErrorBeep();
    } finally {
      processingRef.current = false;
    }
  }, [userName, routeState, addMessage, sendToAI, executeToolCalls, updateFromTool, undoLastItem, retryCount, messagesRef, showRouteSelection, availableRoutes, selectRoute]);

  const handleWakePhrase = useCallback(async (command: string | null) => {
    const v = voiceRef.current;
    if (!v) return;

    v.unmute();
    // "what's next" means just wake phrase alone - announce current state
    if (!command || command === "what's next") {
      // Just wake up - announce current state
      if (routeState.currentItem?.product) {
        const item = routeState.currentItem;
        const msg = `Welcome back! Current item: ${item.quantity} ${item.product}, ${item.slot_spoken || item.slot}. Did you pick that?`;
        setAiResponse(msg);
        await v.speak(msg);
      } else if (routeState.routeName) {
        const msg = `Welcome back to ${routeState.routeName} route. Say next to continue.`;
        setAiResponse(msg);
        await v.speak(msg);
      } else {
        const msg = "I'm back. What would you like to do?";
        setAiResponse(msg);
        await v.speak(msg);
      }
    } else {
      // Process the actual command after wake phrase
      await handleTranscript(command, true);
    }
  }, [routeState, handleTranscript]);

  // Smart error handler - detects mic permission issues and rate limits
  const handleVoiceError = useCallback((errorMsg: string) => {
    const lower = errorMsg.toLowerCase();

    // Mic permission denied
    if (lower.includes('permission') || lower.includes('notallowed') || lower.includes('not allowed') || lower.includes('denied')) {
      setShowMicHelp(true);
      setError('Microphone access denied');
      return;
    }

    // Rate limit errors
    if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many')) {
      setError('Voice service is busy. Please wait a moment and try again.');
      return;
    }

    // Generic error
    setError(errorMsg);
  }, []);

  // Environment detection for adaptive voice recognition
  const {
    environment,
    isDetecting: isDetectingEnvironment,
    detectEnvironment,
    setEnvironmentManual
  } = useEnvironmentDetection();

  const voice = useVoice({
    onTranscript: handleTranscript,
    onError: handleVoiceError,
    onWakePhrase: handleWakePhrase,
    continuous: true,
    keywords: [...routeKeywords, ...learnedKeywords],  // Dynamic route names + learned keywords
    environmentEndpointing: environment.endpointing  // Adaptive endpointing based on environment
  });

  // Expose transcript injection for Playwright E2E testing (no mic in headless)
  useEffect(() => {
    (window as any).__testInjectTranscript = (text: string) => {
      handleTranscript(text, true);
    };
    return () => { delete (window as any).__testInjectTranscript; };
  }, [handleTranscript]);

  // Handle environment auto-detection (requires microphone access)
  const handleDetectEnvironment = useCallback(async () => {
    // CRITICAL: Don't auto-detect while voice is active - causes mic conflict on Android
    if (voice.status === 'listening' || voice.status === 'speaking') {
      setError('Stop voice session first, then run auto-detect');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      await detectEnvironment(stream);
    } catch (error: any) {
      console.error('[StockerApp] Environment detection failed:', error);
      setError('Microphone access required for environment detection');
    }
  }, [detectEnvironment, setError, voice.status]);

  // Store voice in ref for callbacks
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  // Detect iOS PWA and show warning - getUserMedia is broken in iOS standalone mode
  useEffect(() => {
    if (isIOS && isPWA) {
      console.log('[StockerApp] iOS PWA detected - getUserMedia() is broken in standalone mode');
      setShowPWAWarning(true);
    }
  }, [isIOS, isPWA]);

  // Extract route names as keywords for improved voice recognition
  useEffect(() => {
    if (availableRoutes.length > 0) {
      const routeNames = availableRoutes.map(route => route.route_name.toLowerCase());
      setRouteKeywords(routeNames);
      console.log('[StockerApp] Updated voice recognition keywords:', routeNames);
    }
  }, [availableRoutes]);

  // Fetch learned keywords from database for improved voice recognition
  useEffect(() => {
    async function fetchLearnedKeywords() {
      if (!userId) return;

      console.log('[StockerApp] Fetching learned keywords for user:', userId);
      const keywords = await keywordLearning.getUserKeywords(0.60, 50);
      setLearnedKeywords(keywords);
      console.log('[StockerApp] Loaded', keywords.length, 'learned keywords with confidence > 0.60');
    }

    fetchLearnedKeywords();
  }, [userId]); // keywordLearning is a stable hook - don't include in deps

  // CRITICAL: Clean up voice session on unmount (navigation away from this page)
  // This prevents mic from staying open when user navigates to other pages
  // CRITICAL: Save progress before app closes (prevents data loss on crash/close)
  useEffect(() => {
    const handleBeforeUnload = async (e: BeforeUnloadEvent) => {
      // Force synchronous save before close
      if (routeState.routeName && userId) {
        try {
          await saveSessionState();
          console.log('[Stocker] Progress saved before close');
        } catch (error) {
          console.error('[Stocker] Failed to save before close:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [routeState.routeName, userId, saveSessionState]);

  useEffect(() => {
    return () => {
      console.log('[StockerApp] Unmounting - stopping voice session');
      voice.stopListening();
      voice.stopAudio();
    };
  }, [voice.stopListening, voice.stopAudio]);

  useEffect(() => {
    if (sessionId && userId) setSession(sessionId, userId);
  }, [sessionId, userId, setSession]);

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, user, navigate]);

  // Online/offline handling (from original PWA)
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Proactive mic permission check on load
  useEffect(() => {
    const checkMicPermission = async () => {
      try {
        // Check if permissions API is available
        if (navigator.permissions) {
          const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          setMicPermission(result.state as 'prompt' | 'granted' | 'denied');

          // Listen for permission changes
          result.onchange = () => {
            setMicPermission(result.state as 'prompt' | 'granted' | 'denied');
          };
        } else {
          // Fallback - assume we need to prompt
          setMicPermission('prompt');
        }
      } catch {
        // If query fails, assume prompt needed
        setMicPermission('prompt');
      }
    };

    checkMicPermission();
  }, []);

  // Reset urlRouteProcessed when route ID in URL changes
  // CRITICAL: Prevents stale session restoration when clicking different route from dashboard
  useEffect(() => {
    if (routeIdFromUrl && routeIdFromUrl !== lastRouteIdRef.current) {
      console.log('[Stocker] Route ID changed:', {
        from: lastRouteIdRef.current,
        to: routeIdFromUrl
      });
      lastRouteIdRef.current = routeIdFromUrl;
      setUrlRouteProcessed(false); // Reset so new route gets processed
      initStartedRef.current = false; // Allow re-initialization
    }
  }, [routeIdFromUrl]);

  // Check for saved session on mount (with route verification from original PWA)
  // Also handle route ID from URL parameter
  useEffect(() => {
    const checkSavedSession = async () => {
      // Prevent double initialization
      if (!userId || initialized || initStartedRef.current) return;
      initStartedRef.current = true;

      // CRITICAL: If Safari/iOS needs audio unlock, wait for it before continuing
      if ((isSafari || isIOS) && !audioUnlocked) {
        console.log('[Stocker] Waiting for audio unlock before initializing...');
        initStartedRef.current = false; // Reset so we can try again when unlocked
        return; // This useEffect will re-run when audioUnlocked changes
      }

      // Detect page refresh for resume-vs-restart decision
      const isRefresh = performance.getEntriesByType &&
                        performance.getEntriesByType('navigation').length > 0 &&
                        (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).type === 'reload';

      // Handle route ID from URL (Start Picking from MyRoutes OR accidental refresh)
      if (routeIdFromUrl && !urlRouteProcessed) {
        setUrlRouteProcessed(true);

        // Check if saved session matches this route (accidental refresh scenario)
        const savedForCheck = await sessionPersistence.load(userId);
        const isResumeRefresh = isRefresh &&
          savedForCheck &&
          sessionPersistence.isValidSession(savedForCheck) &&
          savedForCheck.userId === userId &&
          savedForCheck.routeId === routeIdFromUrl;

        if (isResumeRefresh) {
          // Accidental refresh with matching saved session — fall through to resume code below
          console.log('[Stocker] Refresh detected with matching saved session — resuming');
        } else {
          // NEW route from MyRoutes (or different route) — start this route directly
          console.log('[Stocker] Route ID from URL (NEW navigation):', routeIdFromUrl);

          try {
            // Fetch route details from database
            const { data: routeData, error: routeError } = await supabase
              .from('routes')
              .select('id, route_name, delivery_date, total_machines, total_items')
              .eq('id', routeIdFromUrl)
              .limit(1);

            const route = routeData?.[0];
            console.log('[Stocker] Route query result:', { found: !!route, error: routeError?.message });

            if (!routeError && route) {
              // Clear any existing session and start fresh with this route
              await sessionPersistence.clear(userId);
              reset();
              const newSessionId = generateNewSessionId();
              setSession(newSessionId, userId); // Set session immediately to avoid race condition

              // Set greeting BEFORE async voice ops so user sees feedback immediately
              const greeting = `Hi ${userName}! Starting ${route.route_name} route. Ready to go?`;
              setAiResponse(greeting);
              addMessage({ role: 'assistant', content: greeting });
              setInitialized(true);

              // Start listening (safe now - audio is unlocked)
              await voice.startListening();

              // Set up route for selection and auto-start
              setAvailableRoutes([{
                id: route.id,
                route_name: route.route_name,
                machines: route.total_machines || 0,
                items: route.total_items || 0,
                machine_names: []
              }]);
              setRouteSelectionDate(route.delivery_date);

              await voice.speak(greeting);

              // Trigger route start directly (can't rely on useEffect — showRouteSelection is false)
              (window as any).__routeStartDate = route.delivery_date;
              triggerRouteStart(route.route_name);
              return;
            } else {
              console.log('[Stocker] Route not found:', routeIdFromUrl, routeError);
              // Fall through to normal flow if route not found
            }
          } catch (urlRouteError) {
            console.error('[Stocker] Failed to start route from URL:', urlRouteError);
            // Fall through to saved session / startFresh
          }
        }
      }

      const saved = await sessionPersistence.load(userId);
      console.log('[Stocker] Loaded saved session:', {
        hasSaved: !!saved,
        isValid: sessionPersistence.isValidSession(saved),
        routeName: saved?.routeName,
        routeDate: saved?.routeDate,
        completed: saved?.completed,
        savedAt: saved?.savedAt ? new Date(saved.savedAt).toLocaleString() : null
      });

      if (sessionPersistence.isValidSession(saved) && saved?.userId === userId) {
        // Verify route still exists before resuming
        const routeExists = await verifyRouteExists(userId, saved.routeName, saved.routeDate);
        console.log('[Stocker] Route verification:', { routeName: saved.routeName, exists: routeExists });

        if (routeExists) {
          // Reuse isRefresh variable defined earlier
          console.log('[Stocker] Navigation type:', isRefresh ? 'refresh' : 'new');

          if (isRefresh) {
            // AUTO-RESUME on page refresh (e.g., pull-to-refresh, desktop F5)
            // Don't interrupt user with dialog - seamlessly continue where they left off
            console.log('[Stocker] Auto-resuming session after page refresh');
            setSavedSession(saved);

            // Restore session state immediately
            // FIX: Clear stale currentItem if already in completedItems (prevents showing
            // a completed item as "current" after resume, especially when pick-count changed)
            // Blank-slot-safe key — matches the live Done-card dedup: prefer the
            // item's sequence position, fall back to slot only when it's absent.
            const rkey = (it: any) => `${it.machineName}:${it.item_index != null ? 'i' + it.item_index : 's' + (it.slot || '')}:${it.product}`;
            const completedKeys = new Set((saved.completedItems || []).map(rkey));
            const restoredItem1 = saved.currentItem
              && completedKeys.has(rkey(saved.currentItem))
              ? null : saved.currentItem;
            const restoredItem2 = saved.currentItem2
              && completedKeys.has(rkey(saved.currentItem2))
              ? null : (saved.currentItem2 || null);

            setRouteState({
              routeId: saved.routeId || null,
              routeName: saved.routeName,
              routeDate: saved.routeDate,
              totalMachines: saved.totalMachines,
              currentMachineIndex: saved.currentMachineIndex,
              currentMachineName: saved.currentMachineName,
              currentMachineId: saved.currentMachineId || null,
              currentMachineTotalItems: saved.currentMachineTotalItems || 0,
              currentMachineItemsRemaining: saved.currentMachineItemsRemaining || 0,
              currentItem: restoredItem1,
              currentItem2: restoredItem2,
              totalItems: saved.totalItems,
              completedItems: saved.completedItems,
              machines: saved.machines || []
            });

            // Restore conversation history
            if (saved.conversationHistory && Array.isArray(saved.conversationHistory)) {
              setMessages(sanitizeConversationHistory(saved.conversationHistory));
            }

            // CRITICAL: Set session ID BEFORE starting voice (prevents "still getting ready" error)
            if (saved.sessionId) {
              console.log('[Session] Auto-resume: Setting session ID:', saved.sessionId);
              setSessionId(saved.sessionId);
              setSession(saved.sessionId, userId);
            } else {
              const newSessionId = generateNewSessionId();
              console.log('[Session] Auto-resume: Generating new session ID:', newSessionId);
              setSessionId(newSessionId);
              setSession(newSessionId, userId);
            }
            console.log('[Session] Session ID set, voice starting next...');

            // CRITICAL: Restart voice system after refresh
            await voice.startListening();

            // Announce resume to user
            // Check if we were waiting for direction response when paused
            if (saved.pendingMachineTransition) {
              const prevMachine = saved.currentMachineName;
              const nextMachine = saved.pendingMachineTransition.nextMachineName;
              const msg = `Welcome back! ${prevMachine} complete. Next is ${nextMachine}. Would you like to start at the top of the list for this machine, or the bottom?`;
              setAiResponse(msg);
              await voice.speak(msg);
            } else {
              // Use restoredItem1 (not saved.currentItem) since stale items were cleared
              const item = restoredItem1;
              if (item?.product) {
                const msg = `Welcome back! Resuming ${saved.routeName}. Current item: ${item.quantity} ${item.product}, ${item.slot_spoken || item.slot}.`;
                setAiResponse(msg);
                await voice.speak(msg);
              } else {
                const msg = `Welcome back! Resuming ${saved.routeName}. Say next to continue.`;
                setAiResponse(msg);
                await voice.speak(msg);
              }
            }

            setInitialized(true);
            setShowResumeDialog(false);
          } else {
            // SHOW DIALOG for new navigation (app reopened, different tab, etc)
            // User might want fresh start in this case
            console.log('[Stocker] Showing resume dialog for new navigation');
            setSavedSession(saved);
            setShowResumeDialog(true);
          }
        } else {
          // Route was deleted - clear stale session silently
          console.log('[Stocker] Route no longer exists, clearing stale session');
          await sessionPersistence.clear(userId);
          startFresh();
        }
      } else {
        console.log('[Stocker] No valid session found, starting fresh');
        startFresh();
      }
    };

    if (!loading && user && !initialized) {
      checkSavedSession().catch((err) => {
        console.error('[Stocker] Init failed:', err);
        initStartedRef.current = false;
        // Show fallback so user isn't stuck on "Waiting for command..."
        setAiResponse('Something went wrong starting up. Please refresh the page.');
        setInitialized(true);
      });
    }
  }, [loading, user, userId, initialized, sessionPersistence, routeIdFromUrl, urlRouteProcessed, voice, userName, addMessage, reset, generateNewSessionId, audioUnlocked]);

  const resumeSession = useCallback(async () => {
    if (!savedSession) return;

    // CRITICAL FIX: If pending transition exists, ensure currentMachineId matches
    const currentMachineId = savedSession.pendingMachineTransition
      ? savedSession.pendingMachineTransition.nextMachineId
      : savedSession.currentMachineId || null;

    const currentMachineName = savedSession.pendingMachineTransition
      ? savedSession.pendingMachineTransition.nextMachineName
      : savedSession.currentMachineName;

    // FIX: Clear stale currentItem if already in completedItems (prevents showing
    // a completed item as "current" after resume, especially when pick-count changed)
    // Blank-slot-safe key — matches the live Done-card dedup: prefer the item's
    // sequence position, fall back to slot only when it's absent.
    const rkey = (it: any) => `${it.machineName}:${it.item_index != null ? 'i' + it.item_index : 's' + (it.slot || '')}:${it.product}`;
    const completedKeys = new Set((savedSession.completedItems || []).map(rkey));
    const restoredItem1 = savedSession.currentItem
      && completedKeys.has(rkey(savedSession.currentItem))
      ? null : savedSession.currentItem;
    const restoredItem2 = savedSession.currentItem2
      && completedKeys.has(rkey(savedSession.currentItem2))
      ? null : (savedSession.currentItem2 || null);

    setRouteState({
      routeId: savedSession.routeId || null,
      routeName: savedSession.routeName,
      routeDate: savedSession.routeDate,
      totalMachines: savedSession.totalMachines,
      currentMachineIndex: savedSession.currentMachineIndex,
      currentMachineName: currentMachineName,
      currentMachineId: currentMachineId,
      currentMachineTotalItems: savedSession.currentMachineTotalItems || 0,
      currentMachineItemsRemaining: savedSession.currentMachineItemsRemaining || 0,
      currentItem: restoredItem1,
      currentItem2: restoredItem2,
      completedItems: savedSession.completedItems || [],
      machines: savedSession.machines || [],
      completed: savedSession.completed || false,
      pendingMachineTransition: savedSession.pendingMachineTransition || null,
      pickDirection: savedSession.pickDirection || null
    });
    // Restore saved session ID, or generate new one if missing
    if (savedSession.sessionId) {
      setSessionId(savedSession.sessionId);
      setSession(savedSession.sessionId, userId); // Set session immediately
    } else {
      const newSessionId = generateNewSessionId();
      setSession(newSessionId, userId); // Set session immediately to avoid race condition
    }
    setMessages(sanitizeConversationHistory(savedSession.conversationHistory || []));

    setShowResumeDialog(false);
    setInitialized(true);
    await voice.startListening();

    // Announce resume
    // Check if we were waiting for direction response when paused
    if (savedSession.pendingMachineTransition) {
      const prevMachine = savedSession.currentMachineName;
      const nextMachine = savedSession.pendingMachineTransition.nextMachineName;
      const msg = `Welcome back! ${prevMachine} complete. Next is ${nextMachine}. Would you like to start at the top of the list for this machine, or the bottom?`;
      setAiResponse(msg);
      await voice.speak(msg);
    } else {
      // Use restoredItem1 (not savedSession.currentItem) since stale items were cleared
      const item = restoredItem1;
      if (item?.product) {
        const msg = `Welcome back to ${savedSession.routeName}! Current item: ${item.quantity} ${item.product}, ${item.slot_spoken || item.slot}.`;
        setAiResponse(msg);
        await voice.speak(msg);
      } else {
        await voice.speak(`Welcome back to ${savedSession.routeName} route. Say next to continue.`);
      }
    }
  }, [savedSession, setRouteState, setSessionId, generateNewSessionId, setMessages, voice]);

  // selectRoute is now defined above handleTranscript to avoid "used before declaration" error
  // Trigger the normal flow after route selection
  const triggerRouteStart = useCallback((routeName: string) => {
    setTimeout(() => {
      const storedDate = (window as any).__routeStartDate;
      const dateStr = storedDate ? ` for ${storedDate}` : '';
      handleTranscript(`start ${routeName} route${dateStr}`, true);
      // Clean up stored date
      delete (window as any).__routeStartDate;
    }, 500);
  }, [handleTranscript]);

  // Effect to trigger route start after selection
  useEffect(() => {
    if (selectedRoute && showRouteSelection) {
      triggerRouteStart(selectedRoute);
      setSelectedRoute(null); // Reset to prevent re-triggering
    }
  }, [selectedRoute, showRouteSelection, triggerRouteStart]);

  // Effect to hide route selection once first item is loaded
  useEffect(() => {
    if (showRouteSelection && routeState.currentItem) {
      setShowRouteSelection(false);
    }
  }, [showRouteSelection, routeState.currentItem]);

  const startFresh = useCallback(async () => {
    if (userId) {
      await sessionPersistence.clear(userId);
    }
    reset();
    const newSessionId = generateNewSessionId(); // Generate new session ID for fresh start
    setSession(newSessionId, userId); // Set session immediately to avoid race condition with getRoutes
    setShowResumeDialog(false);
    setInitialized(true);

    // Start listening
    await voice.startListening();

    try {
      // Use local date, not UTC
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Calculate tomorrow's date
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

      // Check today's routes first
      let data = await getRoutes(today);
      let routeDate = today;
      let dateLabel = 'today';

      // If no routes today, check tomorrow
      if (!data.routes?.length) {
        const tomorrowData = await getRoutes(tomorrowStr);
        if (tomorrowData.routes?.length) {
          data = tomorrowData;
          routeDate = tomorrowStr;
          dateLabel = 'tomorrow';
        }
      }

      if (data.routes?.length) {
        // Store routes for AI context (but don't show cards - voice only!)
        setAvailableRoutes(data.routes);
        setRouteSelectionDate(routeDate);

        const names = data.routes.map((r: any) => r.route_name);

        if (names.length === 1) {
          // SINGLE ROUTE: One smooth greeting that includes everything
          const routeName = names[0];
          const greeting = dateLabel === 'today'
            ? `Hi ${userName}! You've got ${routeName} today. Ready to go?`
            : `Hi ${userName}! You've got ${routeName} for tomorrow. Ready to go?`;
          setAiResponse(greeting);
          addMessage({ role: 'assistant', content: greeting });
          await voice.speak(greeting);

          // Auto-start immediately after greeting - no redundant announcement needed
          selectRoute(routeName);
        } else {
          // MULTIPLE ROUTES: Pure voice - no cards
          let greeting = '';
          if (names.length === 2) {
            greeting = dateLabel === 'today'
              ? `Hi ${userName}! You have the ${names[0]} and ${names[1]} Routes for today, which would you like to start with?`
              : `Hi ${userName}! You have the ${names[0]} and ${names[1]} Routes for tomorrow, which would you like to start with?`;
          } else {
            const routeList = [...names];
            const lastRoute = routeList.pop();
            greeting = dateLabel === 'today'
              ? `Hi ${userName}! You have the ${routeList.join(', ')}, and ${lastRoute} Routes for today, which would you like to start with?`
              : `Hi ${userName}! You have the ${routeList.join(', ')}, and ${lastRoute} Routes for tomorrow, which would you like to start with?`;
          }
          setAiResponse(greeting);
          addMessage({ role: 'assistant', content: greeting });
          await voice.speak(greeting);

          // Stay on voice app screen - AI will handle the response
        }
      } else {
        // NO ROUTES for today or tomorrow
        setShowRouteSelection(false);
        const greeting = `Hi ${userName}! No routes for today or tomorrow. Upload one below, or tell me a specific date.`;
        setAiResponse(greeting);
        addMessage({ role: 'assistant', content: greeting });
        await voice.speak(greeting);
      }
    } catch {
      setShowRouteSelection(false);
      const greeting = `Hi ${userName}! Ready to stock. What route would you like to work on?`;
      setAiResponse(greeting);
      addMessage({ role: 'assistant', content: greeting });
      await voice.speak(greeting);
    }
  }, [userId, sessionPersistence, reset, generateNewSessionId, voice, getRoutes, userName, addMessage, selectRoute, audioUnlocked, isSafari, isIOS]);

  // Tap-to-advance (from original PWA)
  const handleItemCardClick = useCallback(() => {
    if (routeState.currentItem && !routeState.completed && voice.status === 'listening') {
      handleTranscript('next', true);
    }
  }, [routeState, voice.status, handleTranscript]);

  const handleBackToDashboard = () => {
    voice.stopAudio();      // Stop any speaking immediately
    voice.stopListening();  // Stop microphone

    // Invalidate cache so dashboard shows current progress
    try {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['route-machines'] });
      queryClient.invalidateQueries({ queryKey: ['my-routes'] });
    } catch (error) {
      console.error('[Dashboard] Cache invalidation failed, continuing anyway:', error);
      // Continue - dashboard will refetch on mount anyway
    }

    navigate('/dashboard');
  };

  // Triple-tap to show diagnostics AND recover voice system (hidden troubleshooting feature)
  const tapTimesRef = useRef<number[]>([]);
  useEffect(() => {
    const handleTripleTap = async (e: TouchEvent | MouseEvent) => {
      const now = Date.now();
      tapTimesRef.current.push(now);

      // Keep only taps within last second
      tapTimesRef.current = tapTimesRef.current.filter(t => now - t < 1000);

      // If 3 taps within 1 second, show diagnostics AND attempt recovery
      if (tapTimesRef.current.length >= 3) {
        console.log('[Triple-Tap] Triggered - showing diagnostics and attempting voice recovery');
        setShowDiagnostics(true);
        tapTimesRef.current = [];

        // Attempt to recover voice system
        try {
          await voice.unlockAudio();
          console.log('[Triple-Tap] Audio unlocked');

          // If not already listening, start
          if (voice.status !== 'listening' && voice.status !== 'speaking') {
            await voice.startListening();
            console.log('[Triple-Tap] Voice system restarted');
          }
        } catch (e) {
          console.error('[Triple-Tap] Recovery failed:', e);
        }
      }
    };

    window.addEventListener('touchend', handleTripleTap);
    window.addEventListener('click', handleTripleTap);

    return () => {
      window.removeEventListener('touchend', handleTripleTap);
      window.removeEventListener('click', handleTripleTap);
    };
  }, [voice]);

  const handleMuteToggle = () => {
    if (voice.status === 'muted') {
      voice.unmute();
    } else {
      voice.mute();
    }
  };

  const handlePauseToggle = () => {
    // FIX: Pause also mutes microphone to prevent background noise pickup
    // User can now use pause OR mute button - they do the same thing
    if (voice.status === 'paused' || voice.status === 'muted') {
      voice.unmute();
    } else {
      voice.mute();
    }
  };

  // Stop/Continue toggle with confirmation dialog (from original PWA)
  const handleStopClick = () => {
    // If already stopped, resume immediately
    if (voice.status === 'idle') {
      voice.startListening();
      setAiResponse('Resumed. Say "OK Stocker" for commands.');
      return;
    }

    // Otherwise show confirmation
    setShowStopConfirm(true);
  };

  const confirmStop = async () => {
    voice.stopAudio();
    voice.stopListening();
    await saveSessionState();
    setShowStopConfirm(false);
    setAiResponse('Stopped. Progress saved. Tap Continue or say "OK Stocker Continue" to resume.');
  };

  const cancelStop = () => {
    setShowStopConfirm(false);
  };

  // Reset Route - Clear all progress and start fresh
  const handleResetClick = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = async () => {
    try {
      console.log('[Reset] Starting reset process...');

      // Step 1: Set clearing flag to block auto-save
      setIsClearing(true);
      console.log('[Reset] Auto-save blocked');

      // Step 2: Wait for any pending operations to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('[Reset] Waited for pending operations');

      // Step 3: Clear both local (IndexedDB) and server (Supabase) sessions
      await sessionPersistence.clear(userId);
      console.log('[Reset] Session cleared from IndexedDB and Supabase');

      // Step 4: Invalidate React Query cache so dashboard shows fresh state
      try {
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        queryClient.invalidateQueries({ queryKey: ['route-machines'] });
        queryClient.invalidateQueries({ queryKey: ['my-routes'] });
        console.log('[Reset] Dashboard cache invalidated');
      } catch (error) {
        console.error('[Reset] Cache invalidation failed, continuing anyway:', error);
        // Continue - page reload will clear state anyway
      }

      // Step 5: Wait for clear to propagate
      await new Promise(resolve => setTimeout(resolve, 300));
      console.log('[Reset] Verified clear completed');

      // Step 6: Navigate to /app without route param to get clean state
      // Using href (not reload) ensures ?route=X is stripped, preventing stale route restart
      console.log('[Reset] Navigating to clean /app...');
      window.location.href = '/app';
    } catch (error) {
      console.error('[Reset] Failed to reset route:', error);
      setError('Failed to reset route. Please refresh the page.');
      setIsClearing(false); // Reset flag on error
    }
  };

  const cancelReset = () => {
    setShowResetConfirm(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // Safari/iOS Audio Unlock Overlay - MUST happen before any other UI
  // This ensures audio is unlocked with the first user gesture, before async operations
  if ((isIOS || isSafari) && !audioUnlocked) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center p-6">
        {/* Logo */}
        <div className="h-32 w-32 bg-white rounded-full shadow-lg shadow-teal-500/30 mb-8 overflow-hidden">
          <img src="/stocker-ai-logo.jpg" alt="Stocker AI" className="w-full h-full object-cover object-center" />
        </div>

        {/* Unlock prompt */}
        <div className="bg-amber-500/10 border-2 border-amber-500/50 rounded-2xl p-8 max-w-md w-full mb-6">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-amber-400 mb-3">👆 Tap to Begin</h2>
            <p className="text-amber-300 text-lg mb-2">
              Safari requires a tap to enable voice
            </p>
            <p className="text-amber-200/70 text-sm">
              This unlocks audio and microphone for the voice assistant
            </p>
          </div>
        </div>

        {/* Big unlock button */}
        <Button
          onClick={async () => {
            try {
              console.log('[Safari Unlock] Attempting audio unlock...');
              await voice.unlockAudio();
              console.log('[Safari Unlock] Audio unlocked successfully');
              setAudioUnlocked(true);
            } catch (e) {
              console.error('[Safari Unlock] Failed:', e);
              // Try again - sometimes it needs a second tap
              try {
                await voice.unlockAudio();
                setAudioUnlocked(true);
              } catch (e2) {
                console.error('[Safari Unlock] Second attempt failed:', e2);
                setError('Unable to unlock audio. Please try refreshing the page.');
              }
            }
          }}
          className="w-full max-w-md h-24 text-3xl font-bold bg-amber-600 hover:bg-amber-700 rounded-2xl shadow-lg shadow-amber-500/30 animate-pulse"
        >
          TAP HERE
        </Button>

        {/* Skip button for non-voice usage */}
        <button
          onClick={() => setAudioUnlocked(true)}
          className="mt-6 text-gray-500 hover:text-gray-300 text-sm underline"
        >
          Skip (voice won't work)
        </button>
      </div>
    );
  }

  // Resume dialog - SIMPLIFIED for 5-year-old proof UX
  if (showResumeDialog && savedSession) {
    const completedCount = savedSession.machines?.filter((m: any) => m.status === 'completed').length || 0;
    const progressPercent = Math.round((completedCount / savedSession.totalMachines) * 100);
    return (
      <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center p-6">
        {/* Logo */}
        <div className="h-24 w-24 bg-white rounded-full shadow-lg shadow-teal-500/30 mb-6 overflow-hidden">
          <img src="/stocker-ai-logo.jpg" alt="Stocker AI" className="w-full h-full object-cover object-center" />
        </div>

        {/* Route info card */}
        <div className="bg-[#161b22] rounded-2xl border border-gray-700 p-6 max-w-sm w-full mb-6">
          <h2 className="text-2xl font-bold text-white text-center mb-2">{savedSession.routeName}</h2>
          <p className="text-gray-400 text-center mb-4">
            Machine {completedCount} of {savedSession.totalMachines}
          </p>
          {/* Progress bar */}
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-sm text-emerald-400 text-center">{progressPercent}% complete</p>
        </div>

        {/* BIG CONTINUE BUTTON */}
        <Button
          onClick={resumeSession}
          className="w-full max-w-sm h-20 text-2xl font-bold bg-emerald-600 hover:bg-emerald-700 rounded-2xl shadow-lg shadow-emerald-500/30 mb-4"
        >
          <Play className="h-8 w-8 mr-3" />
          CONTINUE
        </Button>

        {/* Small start fresh option */}
        <button
          onClick={startFresh}
          className="text-gray-500 hover:text-gray-300 text-sm underline"
        >
          or start a different route
        </button>
      </div>
    );
  }

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
    <div className="min-h-screen bg-gradient-to-b from-[#0d1117] via-[#161b22] to-[#0d1117] text-white flex flex-col select-none">
      {/* iOS PWA Warning Modal - getUserMedia is completely broken in standalone mode */}
      {showPWAWarning && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4">
          <div className="bg-[#161b22] rounded-xl border border-red-800 p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <AlertTriangle className="h-8 w-8 text-red-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">iOS App Mode Not Supported</h2>
            </div>
            <div className="space-y-3 mb-6 text-gray-300">
              <p className="font-medium">Voice commands don't work in iOS App mode due to Apple's WebKit limitations.</p>
              <p className="text-sm">Please use Safari browser instead:</p>
              <div className="bg-gray-800/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold mt-0.5">1.</span>
                  <p>Delete this app from your home screen</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold mt-0.5">2.</span>
                  <p>Open <span className="font-mono bg-blue-500/20 px-1 rounded">stockerapp.com</span> in Safari browser</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold mt-0.5">3.</span>
                  <p>Use the site directly in Safari (don't install to home screen)</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 italic">Technical: getUserMedia() is disabled in iOS standalone PWA mode (WebKit Bug #185448)</p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  // Copy URL to clipboard to make it easy to open in Safari
                  const url = window.location.origin;
                  navigator.clipboard.writeText(url).catch(() => {});
                  window.open(url, '_blank');
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Open in Safari
              </Button>
              <Button
                onClick={() => setShowPWAWarning(false)}
                variant="outline"
                className="flex-1 border-gray-700 text-gray-300"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Offline Banner (from original PWA) */}
      {isOffline && (
        <div className="bg-yellow-600 text-white text-center py-2 px-4 text-sm flex items-center justify-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          You're offline. Some features may not work.
        </div>
      )}

      {/* Mic Permission Banner - Shows when mic is denied */}
      {micPermission === 'denied' && (
        <div
          className="bg-red-600 text-white py-3 px-4 flex items-center justify-center gap-3 cursor-pointer"
          onClick={() => setShowMicHelp(true)}
        >
          <MicOff className="h-5 w-5" />
          <span className="font-medium">Microphone blocked!</span>
          <span className="text-sm opacity-80">Tap here to fix</span>
        </div>
      )}

      {/* Stop Confirmation Modal (from original PWA) */}
      {showStopConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#161b22] rounded-xl border border-gray-800 p-6 max-w-sm w-full">
            <h2 className="text-xl font-semibold text-white mb-2">Stop Route?</h2>
            <p className="text-gray-400 mb-4">Progress will be saved. You can resume later.</p>
            <div className="flex gap-3">
              <Button
                onClick={confirmStop}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                Stop
              </Button>
              <Button
                onClick={cancelStop}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Route Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#161b22] rounded-xl border border-orange-800 p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-orange-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Reset Route?</h2>
            </div>
            <p className="text-gray-400 mb-2">This will:</p>
            <ul className="text-gray-400 text-sm space-y-1 mb-4 list-disc list-inside">
              <li>Clear all picked items</li>
              <li>Reset to route selection</li>
              <li>Delete session progress</li>
            </ul>
            <p className="text-orange-400 text-sm mb-4">You'll need to choose the route again to continue.</p>
            <div className="flex gap-3">
              <Button
                onClick={confirmReset}
                className="flex-1 bg-orange-600 hover:bg-orange-700"
              >
                Reset Route
              </Button>
              <Button
                onClick={cancelReset}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Microphone Permission Help Modal */}
      {showMicHelp && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#161b22] rounded-xl border border-gray-800 p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <MicOff className="h-6 w-6 text-red-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Microphone Access Needed</h2>
            </div>
            <p className="text-gray-400 mb-4">Stocker AI needs microphone access to work. Here's how to enable it:</p>
            <div className="space-y-3 mb-6">
              <div className="flex items-start gap-3 text-sm">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-400 font-bold">1</span>
                </div>
                <p className="text-gray-300">Tap the <Settings className="inline h-4 w-4" /> lock/settings icon in your browser's address bar</p>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-400 font-bold">2</span>
                </div>
                <p className="text-gray-300">Find "Microphone" and change it to "Allow"</p>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-400 font-bold">3</span>
                </div>
                <p className="text-gray-300">Refresh this page and try again</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => window.location.reload()}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Page
              </Button>
              <Button
                onClick={() => setShowMicHelp(false)}
                variant="outline"
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex-1">
          <span className="text-xs text-blue-400 font-semibold uppercase">Route</span>
          <h1 className="text-lg font-semibold">{routeState.routeName || `Hi, ${userName}`}</h1>
        </div>
        <div className="flex-shrink-0 mx-4">
          <div className="h-16 w-16 bg-white rounded-full shadow-lg shadow-teal-500/20 overflow-hidden">
            <img src="/stocker-ai-logo.jpg" alt="Stocker AI" className="w-full h-full object-cover object-center" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-end gap-2">
          {routeState.routeName && (
            <span className="text-sm text-gray-400">
              Machine {routeState.machines.filter(m => m.status === 'completed').length}/{routeState.totalMachines}
            </span>
          )}
          <Button variant="ghost" size="icon" onClick={() => setShowHelpSheet(true)} title="Voice Commands Help">
            <HelpCircle className="h-5 w-5 text-gray-400" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)} title="Settings — AI voice volume">
            <Settings className="h-5 w-5 text-gray-400" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleBackToDashboard} title="Back to Dashboard">
            <ArrowLeft className="h-5 w-5 text-gray-400" />
          </Button>
        </div>
      </header>

      {/* Progress Bar - Only show when route is active */}
      {routeState.routeName && routeState.totalMachines > 0 && (
        <div className="px-4 py-2 bg-[#0d1117] space-y-3">
          {/* Machine Progress */}
          <div>
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3 text-emerald-400" />
                {routeState.completedItems.length} items picked
              </span>
              <span>Machine {routeState.machines.filter(m => m.status === 'completed').length} of {routeState.totalMachines}</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(5, (routeState.machines.filter(m => m.status === 'completed').length / routeState.totalMachines) * 100)}%` }}
              />
            </div>
          </div>

          {/* Current Machine Item Progress */}
          {(() => {
            const itemsTotal = routeState.currentMachineTotalItems;

            // Don't show if no data available yet
            if (!itemsTotal || itemsTotal === 0) {
              console.log('[Progress] Missing data - Total:', itemsTotal);
              return null;
            }

            // CRITICAL FIX: Use completedItems[] array (same SOT as route-level "items picked")
            // machines[].completedItems is synced from backend which includes pre-counted
            // displayed items (start_machine pre-counts before user confirms with "next")
            const itemsCompleted = routeState.completedItems.filter(
              item => item.machineName === routeState.currentMachineName
            ).length;
            const itemPercent = Math.max(5, Math.min(100, (itemsCompleted / itemsTotal) * 100));

            console.log('[Progress] Total:', itemsTotal, 'Completed:', itemsCompleted, 'Percent:', itemPercent);

            return (
              <div>
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span className="text-gray-500">Current Machine</span>
                  <span>{itemsCompleted} of {itemsTotal} items</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
                    style={{ width: `${itemPercent}%` }}
                  />
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Help Sheet */}
      <HelpSheet isOpen={showHelpSheet} onClose={() => setShowHelpSheet(false)} />
      <SettingsSheet isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Diagnostic Overlay - Triple-tap to reveal */}
      <DiagnosticOverlay
        voiceStatus={voice.status}
        isDeepgramConnected={voice.isDeepgramConnected}
        isVisible={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
      />

      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        {showRouteSelection && availableRoutes.length > 0 ? (
          /* Route Selection Cards - Voice first, tap as backup */
          <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
            <div className="text-center mb-6">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                {availableRoutes.length === 1 ? "Your Route" : "Choose a Route"}
              </h2>
              <p className="text-gray-400 text-sm md:text-base">
                {availableRoutes.length === 1
                  ? "Starting shortly..."
                  : "Say the route name or tap to select"}
              </p>
            </div>

            {/* Grid on desktop, stack on mobile */}
            <div className={cn(
              "flex-1 overflow-y-auto",
              availableRoutes.length > 1
                ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3 auto-rows-min"
                : "space-y-3"
            )}>
              {availableRoutes.map((route) => (
                <RouteSelectionCard
                  key={route.id}
                  route={{
                    route_name: route.route_name,
                    route_date: routeSelectionDate,
                    machine_count: route.machines,
                    item_count: route.items,
                    machine_names: route.machine_names || []
                  }}
                  onSelect={(name) => selectRoute(name, routeSelectionDate)}
                  isSelected={selectedRoute === route.route_name}
                  isLoading={selectedRoute === route.route_name}
                />
              ))}
            </div>

            {/* Voice indicator + iOS tap instruction */}
            <div className="bg-[#161b22] rounded-xl p-4 border border-gray-800 mt-4">
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  voice.status === 'listening' ? "bg-green-500/20 animate-pulse" : "bg-gray-800"
                )}>
                  <Mic className={cn(
                    "h-5 w-5",
                    voice.status === 'listening' ? "text-green-400" : "text-gray-500"
                  )} />
                </div>
                <div className="text-center">
                  <span className="text-sm text-gray-400 capitalize block">{voice.status}</span>
                  {voice.lastInput && (
                    <span className="text-sm text-amber-400 truncate block max-w-[200px]">"{voice.lastInput}"</span>
                  )}
                </div>
              </div>
              {/* iOS Safari instruction */}
              <div className="text-center pt-2 border-t border-gray-700">
                <p className="text-xs text-amber-400 font-medium">👆 Tap a route card to begin</p>
                <p className="text-xs text-gray-500 mt-1">Or say the route name</p>
              </div>
            </div>

            {/* AI Response during route selection */}
            <div className="bg-[#161b22] rounded-xl p-4 border border-gray-800 mt-3">
              <span className="text-xs text-purple-400 font-semibold uppercase">Stocker AI Says</span>
              <p className={cn("mt-2 md:text-lg", aiResponse ? "text-white" : "text-gray-500 italic")}>
                {aiResponse || 'Waiting for command...'}
              </p>
            </div>
          </div>
        ) : (
        <>
        {/* Current Item - Tap to advance */}
        <div
          className={cn(
            "bg-[#161b22] rounded-xl p-4 border border-gray-800 cursor-pointer active:scale-[0.98] transition-all",
            routeState.currentItem && voice.status === 'listening' && "border-emerald-500/50 shadow-lg shadow-emerald-500/20"
          )}
          onClick={handleItemCardClick}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-400 font-semibold uppercase">Pick Item</span>
            {routeState.currentItem && voice.status === 'listening' && (
              <span className="text-xs text-emerald-400 animate-pulse">👆 TAP when done</span>
            )}
          </div>
          {routeState.currentItem ? (
            <div className="mt-2">
              {/* First Item */}
              <div className="flex items-baseline gap-2">
                <span className="text-2xl">{routeState.currentItem.product}</span>
                <span className="text-4xl font-bold text-emerald-400">X {routeState.currentItem.quantity}</span>
              </div>
              <div className="text-lg text-gray-300 mt-2">{routeState.currentItem.slot_spoken || routeState.currentItem.slot}</div>
              {routeState.currentItem.inventory_current !== undefined && (
                <div className="text-xs text-gray-500 mt-1">
                  In machine: {routeState.currentItem.inventory_current}/{routeState.currentItem.inventory_parlevel}
                </div>
              )}

              {/* Second Item (2-Pick Mode) */}
              {routeState.currentItem2 && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl">{routeState.currentItem2.product}</span>
                    <span className="text-4xl font-bold text-emerald-400">X {routeState.currentItem2.quantity}</span>
                  </div>
                  <div className="text-lg text-gray-300 mt-2">{routeState.currentItem2.slot_spoken || routeState.currentItem2.slot}</div>
                  {routeState.currentItem2.inventory_current !== undefined && (
                    <div className="text-xs text-gray-500 mt-1">
                      In machine: {routeState.currentItem2.inventory_current}/{routeState.currentItem2.inventory_parlevel}
                    </div>
                  )}
                </div>
              )}

              <div className="text-sm text-gray-500 mt-3">{routeState.currentMachineName}</div>
            </div>
          ) : routeState.completed ? (
            <div className="mt-4 text-center text-emerald-400">
              <CheckCircle className="h-12 w-12 mx-auto mb-2" />
              <p className="text-xl font-bold">Route Complete!</p>
              <p className="text-gray-400 text-sm mt-2">Great job! Say "next route" or tap below</p>
            </div>
          ) : (
            <div className="mt-6 py-8 text-center">
              {/* iOS Safari tap instruction - CRITICAL for audio unlock */}
              {(isIOS || isSafari) && !routeState.routeName && (
                <div
                  className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 cursor-pointer hover:bg-amber-500/20 transition-colors"
                  onClick={async () => {
                    try {
                      await voice.unlockAudio();
                      console.log('[iOS] Audio unlocked via tap');
                    } catch (e) {
                      console.error('[iOS] Audio unlock failed:', e);
                    }
                  }}
                >
                  <p className="text-lg font-semibold text-amber-400 mb-2">👆 Tap Here to Enable Voice</p>
                  <p className="text-sm text-amber-300">
                    Safari requires a tap before voice and audio can work
                  </p>
                </div>
              )}
              <p className="text-sm text-gray-500 italic">
                Your current item to pick will show here
              </p>
            </div>
          )}
        </div>

        {/* Machine List Panel - Collapsible */}
        {routeState.machines.length > 0 && (
          <MachineListPanel
            machines={routeState.machines}
            currentMachineId={routeState.currentMachineId}
            onMachineSelect={(machineId) => {
              // Handle tapping on a skipped machine to return to it
              const machine = routeState.machines.find(m => m.id === machineId);
              if (machine?.status === 'skipped') {
                handleTranscript('go back to skipped machine', true);
              }
            }}
            onSkipMachine={() => {
              handleTranscript('skip machine', true);
            }}
          />
        )}

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

          {/* Voice Control Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleMuteToggle}
              className={cn(
                "flex-1 text-teal-400 border-teal-600 hover:bg-teal-900/30 hover:text-teal-300",
                voice.status === 'muted' && "bg-red-900/50 border-red-700 text-red-300"
              )}
            >
              {voice.status === 'muted' ? (
                <><MicOff className="h-4 w-4 mr-2" /> Unmute</>
              ) : (
                <><Mic className="h-4 w-4 mr-2" /> Mute</>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePauseToggle}
              className={cn(
                "flex-1 text-teal-400 border-teal-600 hover:bg-teal-900/30 hover:text-teal-300",
                voice.status === 'paused' && "bg-orange-900/50 border-orange-700 text-orange-300"
              )}
            >
              {voice.status === 'paused' ? (
                <><Play className="h-4 w-4 mr-2" /> Resume</>
              ) : (
                <><Pause className="h-4 w-4 mr-2" /> Pause</>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleStopClick}
              className="flex-1 text-teal-400 border-teal-600 hover:bg-teal-900/30 hover:text-teal-300"
            >
              {voice.status === 'idle' ? (
                <><Play className="h-4 w-4 mr-2" /> Continue</>
              ) : (
                <><Square className="h-4 w-4 mr-2" /> Stop</>
              )}
            </Button>
          </div>

          {/* Reset Route Button - Only show when route is active */}
          {routeState.routeName && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetClick}
              className="w-full mt-2 text-orange-400 border-orange-600 hover:bg-orange-900/30 hover:text-orange-300"
            >
              <RotateCcw className="h-4 w-4 mr-2" /> Reset Route
            </Button>
          )}

          {(voice.status === 'paused' || voice.status === 'muted') && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              Say "OK Stocker" to resume Stocker AI
            </p>
          )}
        </div>

        {/* AI Response */}
        <div className="bg-[#161b22] rounded-xl p-4 border border-gray-800">
          <span className="text-xs text-purple-400 font-semibold uppercase">Stocker AI Says</span>
          <p className={cn("mt-2", aiResponse ? "text-white" : "text-gray-500 italic")}>
            {aiResponse || 'Waiting for command...'}
          </p>
        </div>

        {/* Completed Items - newest at top, with machine separators */}
        <div className="bg-[#161b22] rounded-xl border border-gray-800 flex-1 overflow-hidden flex flex-col">
          <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
            <span className="text-xs text-gray-400 font-semibold uppercase">Done</span>
            <span className="text-xs text-gray-500">{routeState.completedItems.length} items</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {routeState.completedItems.length === 0 ? (
              <p className="text-gray-500 text-center">No items picked yet</p>
            ) : (
              <div className="space-y-2">
                {[...routeState.completedItems].reverse().map((item, i, arr) => {
                  const prevItem = arr[i - 1];
                  const showMachineSeparator = !!(i > 0 && prevItem?.machineName && item.machineName && prevItem.machineName !== item.machineName);

                  return (
                    <DoneItem
                      key={routeState.completedItems.length - 1 - i}
                      quantity={item.quantity}
                      product={item.product}
                      slot={item.slot}
                      showMachineSeparator={showMachineSeparator}
                      prevMachineName={prevItem?.machineName}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/50 text-red-300 rounded-lg p-3 text-sm" onClick={() => setError(null)}>
            {error}
          </div>
        )}
        </>
        )}
      </main>
    </div>
  );
}
