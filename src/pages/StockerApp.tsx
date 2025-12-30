import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Mic, Package, CheckCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useVoice } from '@/hooks/useVoice';
import { useStockerAI } from '@/hooks/useStockerAI';
import { useStockerSession } from '@/hooks/useStockerSession';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function StockerApp() {
  const navigate = useNavigate();
  const { user, userProfile, signOut, loading } = useAuth();
  const [aiResponse, setAiResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const processingRef = useRef(false);

  const userName = userProfile?.first_name || 'there';
  const userId = user?.id || null;

  const { routeState, sessionId, messages, updateFromTool, addMessage, reset } = useStockerSession(userId);
  const { setSession, sendToAI, executeToolCalls, getRoutes } = useStockerAI();

  const handleTranscript = useCallback(async (transcript: string, isFinal: boolean) => {
    if (!isFinal || processingRef.current) return;
    processingRef.current = true;
    voice.setThinking();

    try {
      addMessage({ role: 'user', content: transcript });
      const allMessages = [...messages, { role: 'user', content: transcript }];

      let response = await sendToAI(allMessages, userName, routeState.currentItem);

      if (response.tool_calls?.length) {
        addMessage(response);
        const toolResults = await executeToolCalls(response.tool_calls, (name, result) => {
          updateFromTool(name, result);
          voice.playBeep(!result.error);
        });

        for (const tr of toolResults) {
          addMessage({ role: 'tool', tool_call_id: tr.tool_call_id, content: JSON.stringify(tr.result) });
        }

        response = await sendToAI([
          ...allMessages,
          response,
          ...toolResults.map(tr => ({ role: 'tool', tool_call_id: tr.tool_call_id, content: JSON.stringify(tr.result) }))
        ], userName, routeState.currentItem);
      }

      if (response.content) {
        setAiResponse(response.content);
        addMessage(response);
        await voice.speak(response.content);
      }
    } catch (err: any) {
      setError(err.message);
      voice.playBeep(false);
    } finally {
      processingRef.current = false;
    }
  }, [messages, userName, routeState.currentItem, addMessage, sendToAI, executeToolCalls, updateFromTool]);

  const voice = useVoice({
    onTranscript: handleTranscript,
    onError: setError,
    continuous: true
  });

  useEffect(() => {
    if (sessionId && userId) setSession(sessionId, userId);
  }, [sessionId, userId, setSession]);

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!loading && user && !initialized) {
      setInitialized(true);
      (async () => {
        try {
          const today = new Date().toISOString().split('T')[0];
          const data = await getRoutes(today);
          let greeting = '';

          if (data.routes?.length) {
            const names = data.routes.map((r: any) => r.route_name);
            greeting = names.length === 1
              ? `Hi ${userName}! You have the ${names[0]} route today. Ready to start?`
              : `Hi ${userName}! You have ${names.join(' and ')} today. Which one first?`;
          } else {
            greeting = `Hi ${userName}! No routes for today. Upload one in the dashboard or tell me a date.`;
          }

          setAiResponse(greeting);
          await voice.speak(greeting);
          await voice.startListening();
        } catch {
          setAiResponse(`Hi ${userName}! Ready to stock. What route?`);
          await voice.startListening();
        }
      })();
    }
  }, [loading, user, initialized, userName, getRoutes, voice]);

  const handleLogout = async () => {
    voice.stopListening();
    await signOut();
    navigate('/dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const statusColors = {
    idle: 'bg-gray-500',
    listening: 'bg-green-500 animate-pulse',
    speaking: 'bg-yellow-500',
    thinking: 'bg-purple-500 animate-pulse',
    paused: 'bg-gray-500',
    error: 'bg-red-500'
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0d1117] via-[#161b22] to-[#0d1117] text-white flex flex-col">
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

      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        {/* Current Item */}
        <div className="bg-[#161b22] rounded-xl p-4 border border-gray-800">
          <span className="text-xs text-emerald-400 font-semibold uppercase">Pick Item</span>
          {routeState.currentItem ? (
            <div className="mt-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-emerald-400">{routeState.currentItem.quantity}x</span>
                <span className="text-xl">{routeState.currentItem.product}</span>
              </div>
              <div className="text-gray-400 mt-1">{routeState.currentItem.slot_spoken || routeState.currentItem.slot}</div>
              <div className="text-sm text-gray-500 mt-1">{routeState.currentMachineName}</div>
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

        {/* Voice Status */}
        <div className="bg-[#161b22] rounded-xl p-4 border border-gray-800 flex items-center gap-3">
          <span className="text-xs text-amber-400 font-semibold uppercase">Mic</span>
          <div className={cn("w-3 h-3 rounded-full", statusColors[voice.status])} />
          <span className="text-sm text-gray-400 capitalize">{voice.status}</span>
          {voice.lastInput && (
            <span className="text-sm text-amber-400 ml-auto truncate max-w-[50%]">"{voice.lastInput}"</span>
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
      </main>

      {/* Bottom Nav */}
      <nav className="flex justify-center gap-12 py-4 border-t border-gray-800 bg-[#161b22]">
        <button className="flex flex-col items-center text-emerald-400">
          <Mic className="h-6 w-6" />
          <span className="text-xs mt-1">Voice</span>
        </button>
      </nav>
    </div>
  );
}
