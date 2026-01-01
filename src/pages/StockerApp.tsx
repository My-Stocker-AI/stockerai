import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, CheckCircle, Mic, MicOff, Pause, Play, Square, AlertTriangle, Settings, RefreshCw, HelpCircle, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useVoice } from '@/hooks/useVoice';
import { useStockerAI } from '@/hooks/useStockerAI';
import { useStockerSession } from '@/hooks/useStockerSession';
import { useSessionPersistence } from '@/hooks/useSessionPersistence';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BottomNav } from '@/components/stocker/BottomNav';
import { UploadTab } from '@/components/stocker/UploadTab';
import { HelpSheet } from '@/components/stocker/HelpSheet';

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

export default function StockerApp() {
  const navigate = useNavigate();
  const { user, userProfile, signOut, loading } = useAuth();
  const [aiResponse, setAiResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState<'voice' | 'upload'>('voice');
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showMicHelp, setShowMicHelp] = useState(false);
  const [showHelpSheet, setShowHelpSheet] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [savedSession, setSavedSession] = useState<any>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied' | 'checking'>('checking');
  const processingRef = useRef(false);
  const initStartedRef = useRef(false); // Prevent double initialization
  const MAX_RETRIES = 2;
  const voiceRef = useRef<any>(null); // Ref to hold voice methods for callbacks

  const userName = userProfile?.first_name || 'there';
  const userId = user?.id || null;

  const { routeState, sessionId, messages, messagesRef, updateFromTool, addMessage, reset, setRouteState, setMessages, setSessionId, generateNewSessionId } = useStockerSession(userId);
  const { setSession, sendToAI, executeToolCalls, getRoutes } = useStockerAI();
  const sessionPersistence = useSessionPersistence();

  // Save session state whenever route changes
  const saveSessionState = useCallback(async () => {
    if (!routeState.routeName || !userId) return;

    const sessionData = {
      sessionId,
      userId,
      routeName: routeState.routeName,
      routeDate: routeState.routeDate,
      totalMachines: routeState.totalMachines,
      currentMachineIndex: routeState.currentMachineIndex,
      currentMachineName: routeState.currentMachineName,
      currentItem: routeState.currentItem,
      completedItems: routeState.completedItems,
      completed: routeState.completed,
      conversationHistory: messages
    };

    await sessionPersistence.save(sessionData, userId);
  }, [routeState, sessionId, messages, userId, sessionPersistence]);

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

  const handleTranscript = useCallback(async (transcript: string, isFinal: boolean) => {
    if (!isFinal || processingRef.current) return;
    const v = voiceRef.current;
    if (!v) return;

    const lower = transcript.toLowerCase().trim();

    // Handle voice pause/mute commands locally (from original PWA)
    if (lower === 'pause' || lower === 'stop listening') {
      v.pauseListening();
      return;
    }
    if (lower === 'mute' || lower === 'mute mic' || lower === 'mute microphone') {
      v.mute();
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
      processingRef.current = false;
      return;
    }

    processingRef.current = true;
    v.setThinking();

    try {
      addMessage({ role: 'user', content: transcript });
      // Use messagesRef.current to avoid stale closure (ref is updated immediately by addMessage)
      const allMessages = trimConversationHistory(sanitizeConversationHistory([...messagesRef.current]));

      let response = await sendToAI(allMessages, userName, routeState.currentItem);

      // CRITICAL: Loop while there are tool_calls (matches original PWA behavior)
      // OpenAI can return BOTH content AND tool_calls - we must process all tool_calls first
      while (response.tool_calls?.length) {
        // Add assistant message with tool_calls (content set to null per OpenAI spec)
        addMessage({ role: 'assistant', content: null, tool_calls: response.tool_calls });

        const toolResults = await executeToolCalls(response.tool_calls, (name, result) => {
          updateFromTool(name, result);
          v.playSuccessBeep(); // Use success beep for item confirmation
        });

        for (const tr of toolResults) {
          addMessage({ role: 'tool', tool_call_id: tr.tool_call_id, content: JSON.stringify(tr.result) });
        }

        // Check for fast path - if tool returned 'spoken' field, use it directly
        let usedFastPath = false;
        for (const tr of toolResults) {
          if (tr.result?.spoken) {
            response = { content: tr.result.spoken };
            usedFastPath = true;
            break;
          }
        }

        if (!usedFastPath) {
          // Use messagesRef.current for the follow-up call too
          response = await sendToAI(trimConversationHistory(sanitizeConversationHistory([...messagesRef.current])), userName, routeState.currentItem);
        } else {
          break; // Exit loop if using fast path
        }
      }

      if (response.content) {
        setAiResponse(response.content);
        addMessage({ role: 'assistant', content: response.content });
        await v.speak(response.content);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Something went wrong';
      const isNetworkError = errorMsg.includes('timeout') ||
                            errorMsg.includes('network') ||
                            errorMsg.includes('fetch') ||
                            errorMsg.includes('Failed to fetch');
      const isRateLimited = errorMsg.includes('429') || errorMsg.includes('rate limit');

      // Auto-retry on network errors (up to MAX_RETRIES)
      if (isNetworkError && retryCount < MAX_RETRIES) {
        setRetryCount(prev => prev + 1);
        setAiResponse('Connection issue, retrying...');
        // Wait 1 second then retry
        await new Promise(resolve => setTimeout(resolve, 1000));
        processingRef.current = false;
        return handleTranscript(transcript, true);
      }

      // Friendly messages for common errors
      if (isRateLimited) {
        setError('Service is busy. Please wait a moment and say that again.');
      } else if (isNetworkError) {
        setError('Connection lost. Check your internet and try again.');
      } else {
        setError(errorMsg);
      }

      setRetryCount(0); // Reset retry count on final failure
      v.playErrorBeep();
    } finally {
      processingRef.current = false;
    }
  }, [userName, routeState, addMessage, sendToAI, executeToolCalls, updateFromTool, undoLastItem, retryCount, messagesRef]);

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

  const voice = useVoice({
    onTranscript: handleTranscript,
    onError: handleVoiceError,
    onWakePhrase: handleWakePhrase,
    continuous: true
  });

  // Store voice in ref for callbacks
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

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

  // Check for saved session on mount (with route verification from original PWA)
  useEffect(() => {
    const checkSavedSession = async () => {
      // Prevent double initialization
      if (!userId || initialized || initStartedRef.current) return;
      initStartedRef.current = true;

      const saved = await sessionPersistence.load(userId);
      if (sessionPersistence.isValidSession(saved) && saved?.userId === userId) {
        // Verify route still exists before showing resume dialog
        const routeExists = await verifyRouteExists(userId, saved.routeName, saved.routeDate);
        if (routeExists) {
          setSavedSession(saved);
          setShowResumeDialog(true);
        } else {
          // Route was deleted - clear stale session silently
          console.log('[Stocker] Route no longer exists, clearing stale session');
          await sessionPersistence.clear(userId);
          startFresh();
        }
      } else {
        startFresh();
      }
    };

    if (!loading && user && !initialized) {
      checkSavedSession();
    }
  }, [loading, user, userId, initialized, sessionPersistence]);

  const resumeSession = useCallback(async () => {
    if (!savedSession) return;

    setRouteState({
      routeName: savedSession.routeName,
      routeDate: savedSession.routeDate,
      totalMachines: savedSession.totalMachines,
      currentMachineIndex: savedSession.currentMachineIndex,
      currentMachineName: savedSession.currentMachineName,
      currentItem: savedSession.currentItem,
      completedItems: savedSession.completedItems || [],
      completed: savedSession.completed || false
    });
    // Restore saved session ID, or generate new one if missing
    if (savedSession.sessionId) {
      setSessionId(savedSession.sessionId);
    } else {
      generateNewSessionId();
    }
    setMessages(sanitizeConversationHistory(savedSession.conversationHistory || []));

    setShowResumeDialog(false);
    setInitialized(true);
    await voice.startListening();

    // Announce resume
    const item = savedSession.currentItem;
    if (item?.product) {
      const msg = `Welcome back to ${savedSession.routeName}! Current item: ${item.quantity} ${item.product}, ${item.slot_spoken || item.slot}.`;
      setAiResponse(msg);
      await voice.speak(msg);
    } else {
      await voice.speak(`Welcome back to ${savedSession.routeName} route.`);
    }
  }, [savedSession, setRouteState, setSessionId, generateNewSessionId, setMessages, voice]);

  const startFresh = useCallback(async () => {
    if (userId) {
      await sessionPersistence.clear(userId);
    }
    reset();
    generateNewSessionId(); // Generate new session ID for fresh start
    setShowResumeDialog(false);
    setInitialized(true);

    // Start listening and greet
    await voice.startListening();

    try {
      // Use local date, not UTC
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const data = await getRoutes(today);
      let greeting = '';

      if (data.routes?.length) {
        const names = data.routes.map((r: any) => r.route_name);
        if (names.length === 1) {
          // AUTO-START: Only one route - start it automatically!
          greeting = `Hi ${userName}! Starting your ${names[0]} route automatically...`;
          setAiResponse(greeting);
          addMessage({ role: 'assistant', content: greeting });
          await voice.speak(greeting);
          // Trigger the route start after a brief pause
          setTimeout(() => {
            handleTranscript(`start ${names[0]} route`, true);
          }, 500);
          return; // Exit early - handleTranscript will handle the rest
        } else if (names.length === 2) {
          greeting = `Hi ${userName}! You have the ${names[0]} and ${names[1]} routes today. Which one?`;
        } else {
          const lastRoute = names.pop();
          greeting = `Hi ${userName}! You have ${names.join(', ')}, and ${lastRoute} routes today. Which one?`;
        }
      } else {
        greeting = `Hi ${userName}! No routes for today. Upload one below or tell me a date!`;
      }

      setAiResponse(greeting);
      addMessage({ role: 'assistant', content: greeting }); // Add to conversation history
      await voice.speak(greeting);
    } catch {
      const greeting = `Hi ${userName}! Ready to stock. What route would you like to work on?`;
      setAiResponse(greeting);
      addMessage({ role: 'assistant', content: greeting }); // Add to conversation history
      await voice.speak(greeting);
    }
  }, [userId, sessionPersistence, reset, generateNewSessionId, voice, getRoutes, userName, addMessage, handleTranscript]);

  // Tap-to-advance (from original PWA)
  const handleItemCardClick = useCallback(() => {
    if (routeState.currentItem && !routeState.completed && voice.status === 'listening') {
      handleTranscript('next', true);
    }
  }, [routeState, voice.status, handleTranscript]);

  const handleLogout = async () => {
    voice.stopAudio();      // Stop any speaking immediately
    voice.stopListening();  // Stop microphone
    await signOut();
    navigate('/dashboard');
  };

  const handleMuteToggle = () => {
    if (voice.status === 'muted') {
      voice.unmute();
    } else {
      voice.mute();
    }
  };

  const handlePauseToggle = () => {
    if (voice.status === 'paused') {
      voice.resumeListening();
    } else {
      voice.pauseListening();
    }
  };

  // Stop with confirmation dialog (from original PWA)
  const handleStopClick = () => {
    setShowStopConfirm(true);
  };

  const confirmStop = async () => {
    voice.stopAudio();
    voice.stopListening();
    await saveSessionState();
    setShowStopConfirm(false);
    setAiResponse('Stopped. Progress saved.');
  };

  const cancelStop = () => {
    setShowStopConfirm(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // Resume dialog - SIMPLIFIED for 5-year-old proof UX
  if (showResumeDialog && savedSession) {
    const progressPercent = Math.round((savedSession.currentMachineIndex / savedSession.totalMachines) * 100);
    return (
      <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center p-6">
        {/* Logo */}
        <img src="/stocker-ai-logo.jpg" alt="Stocker AI" className="h-24 w-24 rounded-full shadow-lg shadow-teal-500/30 mb-6" />

        {/* Route info card */}
        <div className="bg-[#161b22] rounded-2xl border border-gray-700 p-6 max-w-sm w-full mb-6">
          <h2 className="text-2xl font-bold text-white text-center mb-2">{savedSession.routeName}</h2>
          <p className="text-gray-400 text-center mb-4">
            Machine {savedSession.currentMachineIndex} of {savedSession.totalMachines}
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
    <div className="min-h-screen bg-gradient-to-b from-[#0d1117] via-[#161b22] to-[#0d1117] text-white flex flex-col">
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
          <img src="/stocker-ai-logo.jpg" alt="Stocker AI" className="h-12 w-12 rounded-full shadow-lg shadow-teal-500/20" />
        </div>
        <div className="flex-1 flex items-center justify-end gap-2">
          {routeState.routeName && (
            <span className="text-sm text-gray-400">
              Machine {routeState.currentMachineIndex}/{routeState.totalMachines}
            </span>
          )}
          <Button variant="ghost" size="icon" onClick={() => setShowHelpSheet(true)} title="Voice Commands Help">
            <HelpCircle className="h-5 w-5 text-gray-400" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Progress Bar - Only show when route is active */}
      {routeState.routeName && routeState.totalMachines > 0 && (
        <div className="px-4 py-2 bg-[#0d1117]">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-emerald-400" />
              {routeState.completedItems.length} items picked
            </span>
            <span>Machine {routeState.currentMachineIndex} of {routeState.totalMachines}</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(5, (routeState.currentMachineIndex / routeState.totalMachines) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Help Sheet */}
      <HelpSheet isOpen={showHelpSheet} onClose={() => setShowHelpSheet(false)} />

      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden pb-20">
        {activeTab === 'upload' ? (
          <UploadTab />
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
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-emerald-400">{routeState.currentItem.quantity}x</span>
                <span className="text-2xl">{routeState.currentItem.product}</span>
              </div>
              <div className="text-lg text-gray-300 mt-2">{routeState.currentItem.slot_spoken || routeState.currentItem.slot}</div>
              <div className="text-sm text-gray-500 mt-1">{routeState.currentMachineName}</div>
              {routeState.currentItem.inventory_current !== undefined && (
                <div className="text-xs text-gray-500 mt-1">
                  In machine: {routeState.currentItem.inventory_current}/{routeState.currentItem.inventory_parlevel}
                </div>
              )}
            </div>
          ) : routeState.completed ? (
            <div className="mt-4 text-center text-emerald-400">
              <CheckCircle className="h-12 w-12 mx-auto mb-2" />
              <p className="text-xl font-bold">Route Complete!</p>
              <p className="text-gray-400 text-sm mt-2">Great job! Say "next route" or tap below</p>
            </div>
          ) : (
            <div className="mt-6 text-center">
              <Button
                onClick={() => handleTranscript('start my route', true)}
                className="w-full max-w-xs mx-auto h-20 text-2xl font-bold bg-emerald-600 hover:bg-emerald-700 rounded-2xl shadow-lg shadow-emerald-500/30 animate-pulse"
              >
                <Play className="h-8 w-8 mr-3" />
                START ROUTE
              </Button>
              <p className="text-gray-500 text-sm mt-4">Or just say "start my route"</p>
            </div>
          )}
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
              <Square className="h-4 w-4 mr-2" /> Stop
            </Button>
          </div>

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
                  const showMachineSeparator = i > 0 && prevItem?.machineName && item.machineName && prevItem.machineName !== item.machineName;

                  return (
                    <div key={routeState.completedItems.length - 1 - i}>
                      {showMachineSeparator && (
                        <div className="flex items-center gap-2 py-2 my-1">
                          <div className="flex-1 h-px bg-teal-600/50" />
                          <span className="text-xs text-teal-400 font-medium px-2">
                            {prevItem.machineName} ✓
                          </span>
                          <div className="flex-1 h-px bg-teal-600/50" />
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-sm text-gray-400">
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                        <span>{item.quantity}x</span>
                        <span className="flex-1 truncate">{item.product}</span>
                        <span className="text-gray-500">{item.slot}</span>
                      </div>
                    </div>
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

      {/* Bottom Nav */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
