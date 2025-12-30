import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Package, CheckCircle, Mic, MicOff, Pause, Play, Square, AlertTriangle } from 'lucide-react';
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
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [savedSession, setSavedSession] = useState<any>(null);
  const processingRef = useRef(false);
  const voiceRef = useRef<any>(null); // Ref to hold voice methods for callbacks

  const userName = userProfile?.first_name || 'there';
  const userId = user?.id || null;

  const { routeState, sessionId, messages, updateFromTool, addMessage, reset, setRouteState, setMessages, setSessionId } = useStockerSession(userId);
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
      // Sanitize and trim to prevent memory growth (from original PWA)
      const allMessages = trimConversationHistory(sanitizeConversationHistory([...messages, { role: 'user', content: transcript }]));

      let response = await sendToAI(allMessages, userName, routeState.currentItem);

      if (response.tool_calls?.length) {
        addMessage(response);
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
            addMessage({ role: 'assistant', content: tr.result.spoken });
            usedFastPath = true;
            break;
          }
        }

        if (!usedFastPath) {
          response = await sendToAI(trimConversationHistory(sanitizeConversationHistory([
            ...allMessages,
            response,
            ...toolResults.map(tr => ({ role: 'tool', tool_call_id: tr.tool_call_id, content: JSON.stringify(tr.result) }))
          ])), userName, routeState.currentItem);
        }
      }

      if (response.content) {
        setAiResponse(response.content);
        addMessage(response);
        await v.speak(response.content);
      }
    } catch (err: any) {
      setError(err.message);
      v.playErrorBeep();
    } finally {
      processingRef.current = false;
    }
  }, [messages, userName, routeState, addMessage, sendToAI, executeToolCalls, updateFromTool, undoLastItem]);

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

  const voice = useVoice({
    onTranscript: handleTranscript,
    onError: setError,
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

  // Check for saved session on mount (with route verification from original PWA)
  useEffect(() => {
    const checkSavedSession = async () => {
      if (!userId || initialized) return;

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
    setSessionId(savedSession.sessionId || `session_${Date.now()}`);
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
  }, [savedSession, setRouteState, setSessionId, setMessages, voice]);

  const startFresh = useCallback(async () => {
    if (userId) {
      await sessionPersistence.clear(userId);
    }
    reset();
    setShowResumeDialog(false);
    setInitialized(true);

    // Start listening and greet
    await voice.startListening();

    try {
      const today = new Date().toISOString().split('T')[0];
      const data = await getRoutes(today);
      let greeting = '';

      if (data.routes?.length) {
        const names = data.routes.map((r: any) => r.route_name);
        if (names.length === 1) {
          greeting = `Hi ${userName}! Looks like you have the ${names[0]} route ready for today. Ready to go?`;
        } else if (names.length === 2) {
          greeting = `Hi ${userName}! Looks like you have the ${names[0]} and ${names[1]} routes ready for today. Which one would you like to start with?`;
        } else {
          const lastRoute = names.pop();
          greeting = `Hi ${userName}! Looks like you have ${names.join(', ')}, and ${lastRoute} routes ready for today. Which one would you like to start with?`;
        }
      } else {
        greeting = `Hi ${userName}! I don't see any routes for today. Load one below or tell me the date of a preloaded route you'd like to fill!`;
      }

      setAiResponse(greeting);
      await voice.speak(greeting);
    } catch {
      const greeting = `Hi ${userName}! Ready to stock. What route would you like to work on today?`;
      setAiResponse(greeting);
      await voice.speak(greeting);
    }
  }, [userId, sessionPersistence, reset, voice, getRoutes, userName]);

  // Tap-to-advance (from original PWA)
  const handleItemCardClick = useCallback(() => {
    if (routeState.currentItem && !routeState.completed && voice.status === 'listening') {
      handleTranscript('next', true);
    }
  }, [routeState, voice.status, handleTranscript]);

  const handleLogout = async () => {
    voice.stopListening();
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

  // Resume dialog
  if (showResumeDialog && savedSession) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
        <div className="bg-[#161b22] rounded-xl border border-gray-800 p-6 max-w-sm w-full">
          <h2 className="text-xl font-semibold text-white mb-2">Resume Session?</h2>
          <p className="text-gray-400 mb-4">
            {savedSession.routeName} Route - Machine {savedSession.currentMachineIndex}/{savedSession.totalMachines}
          </p>
          <div className="flex gap-3">
            <Button
              onClick={resumeSession}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              Resume
            </Button>
            <Button
              onClick={startFresh}
              variant="outline"
              className="flex-1"
            >
              Start Fresh
            </Button>
          </div>
        </div>
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

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div>
          <span className="text-xs text-blue-400 font-semibold uppercase">Route</span>
          <h1 className="text-lg font-semibold">{routeState.routeName || `Hi, ${userName}`}</h1>
        </div>
        <div className="flex items-center gap-3">
          {routeState.routeName && (
            <span className="text-sm text-gray-400">
              Machine {routeState.currentMachineIndex}/{routeState.totalMachines}
            </span>
          )}
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden pb-20">
        {activeTab === 'upload' ? (
          <UploadTab />
        ) : (
        <>
        {/* Current Item - Tap to advance */}
        <div
          className="bg-[#161b22] rounded-xl p-4 border border-gray-800 cursor-pointer active:scale-[0.98] transition-transform"
          onClick={handleItemCardClick}
        >
          <span className="text-xs text-emerald-400 font-semibold uppercase">Pick Item</span>
          {routeState.currentItem ? (
            <div className="mt-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-emerald-400">{routeState.currentItem.quantity}x</span>
                <span className="text-xl">{routeState.currentItem.product}</span>
              </div>
              <div className="text-gray-400 mt-1">{routeState.currentItem.slot_spoken || routeState.currentItem.slot}</div>
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
              <p>Route Complete!</p>
            </div>
          ) : (
            <div className="mt-4 text-center text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Say "start my route" to begin</p>
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
                "flex-1",
                voice.status === 'muted' && "bg-red-900/50 border-red-700"
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
                "flex-1",
                voice.status === 'paused' && "bg-orange-900/50 border-orange-700"
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
              className="flex-1"
            >
              <Square className="h-4 w-4 mr-2" /> Stop
            </Button>
          </div>

          {(voice.status === 'paused' || voice.status === 'muted') && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              Say "OK Stocker" to resume
            </p>
          )}
        </div>

        {/* AI Response */}
        <div className="bg-[#161b22] rounded-xl p-4 border border-gray-800">
          <span className="text-xs text-purple-400 font-semibold uppercase">StockerAI Says</span>
          <p className={cn("mt-2", aiResponse ? "text-white" : "text-gray-500 italic")}>
            {aiResponse || 'Waiting for command...'}
          </p>
        </div>

        {/* Completed Items */}
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
                {routeState.completedItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-gray-400">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>{item.quantity}x</span>
                    <span className="flex-1 truncate">{item.product}</span>
                    <span className="text-gray-500">{item.slot}</span>
                  </div>
                ))}
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
