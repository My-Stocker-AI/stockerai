import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authFetch } from '@/lib/authFetch';

const ENDPOINT = 'https://stockerai-api.onrender.com/api/incidents';

interface VoiceEvent { t: number; type: string }
interface ReportPayload {
  client_report_id: string;
  category: 'bug' | 'feature_request' | 'feature_improvement';
  description: string;
  session_id: string | null;
  route_id: string | null;
  context: Record<string, unknown>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  sessionId: string | null;
  routeId: string | null;
  context: Record<string, unknown>;
}

function reportId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function queueKey(userId: string) { return `stockerai:incident-queue:${userId}`; }

function readQueue(userId: string): ReportPayload[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(queueKey(userId)) || '[]');
    return Array.isArray(parsed) ? parsed.slice(-10) : [];
  } catch {
    return [];
  }
}

function writeQueue(userId: string, queue: ReportPayload[]) {
  try {
    localStorage.setItem(queueKey(userId), JSON.stringify(queue.slice(-10)));
  } catch {
    // A storage failure must not interrupt picking.
  }
}

async function send(payload: ReportPayload) {
  const response = await authFetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  });
  if (!response.ok) throw new Error(`Incident endpoint returned ${response.status}`);
  return response.json();
}

export function ReportProblemDialog({ isOpen, onClose, userId, sessionId, routeId, context }: Props) {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ReportPayload['category']>('bug');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'queued'>('idle');
  const recentEvents = useRef<VoiceEvent[]>([]);

  useEffect(() => {
    const record = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      recentEvents.current = [
        ...recentEvents.current.slice(-59),
        { t: Date.now(), type: String(detail.type || 'unknown') },
      ];
    };
    window.addEventListener('voice-diagnostic', record);
    return () => window.removeEventListener('voice-diagnostic', record);
  }, []);

  const flushQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const remaining: ReportPayload[] = [];
    for (const payload of readQueue(userId)) {
      try {
        await send(payload);
      } catch {
        remaining.push(payload);
      }
    }
    writeQueue(userId, remaining);
  }, [userId]);

  useEffect(() => {
    void flushQueue();
    window.addEventListener('online', flushQueue);
    return () => window.removeEventListener('online', flushQueue);
  }, [flushQueue]);

  const submit = async () => {
    const clean = description.trim();
    if (clean.length < 3 || state === 'sending') return;
    const payload: ReportPayload = {
      client_report_id: reportId(),
      category,
      description: clean,
      session_id: sessionId,
      route_id: routeId,
      context: {
        ...context,
        reported_at: new Date().toISOString(),
        recent_voice_events: recentEvents.current,
      },
    };
    setState('sending');
    try {
      if (!navigator.onLine) throw new Error('offline');
      await send(payload);
      setState('sent');
    } catch {
      const queue = readQueue(userId).filter(item => item.client_report_id !== payload.client_report_id);
      writeQueue(userId, [...queue, payload]);
      setState('queued');
    }
  };

  const close = () => {
    if (state === 'sending') return;
    if (state === 'sent' || state === 'queued') {
      setDescription('');
      setCategory('bug');
      setState('idle');
    }
    onClose();
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-end bg-black/75 p-0 sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="problem-title">
      <div className="w-full max-w-md rounded-t-3xl border border-gray-700 bg-[#161b22] p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="problem-title" className="text-xl font-bold text-white">Send feedback</h2>
            <p className="mt-1 text-sm text-gray-400">Report a bug or suggest an improvement. Current route and device context are attached automatically.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={close} aria-label="Close feedback"><X className="h-5 w-5" /></Button>
        </div>

        {state === 'sent' || state === 'queued' ? (
          <div className="space-y-4 py-4 text-center">
            {state === 'sent'
              ? <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
              : <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />}
            <p className="font-semibold text-white">{state === 'sent' ? 'Report received.' : 'Saved on this phone.'}</p>
            <p className="text-sm text-gray-400">{state === 'sent'
              ? 'You can keep picking. Your route progress was not changed.'
              : 'It will retry automatically when the connection returns.'}</p>
            <Button onClick={close} className="w-full bg-teal-600 hover:bg-teal-700">Back to picking</Button>
          </div>
        ) : (
          <>
            <label htmlFor="feedback-category" className="mb-2 block text-sm font-medium text-gray-200">Feedback type</label>
            <select
              id="feedback-category"
              value={category}
              onChange={event => setCategory(event.target.value as ReportPayload['category'])}
              className="mb-4 w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-base text-white outline-none focus:border-teal-500"
            >
              <option value="bug">Bug</option>
              <option value="feature_request">New feature</option>
              <option value="feature_improvement">Feature improvement</option>
            </select>
            <label htmlFor="problem-description" className="mb-2 block text-sm font-medium text-gray-200">What happened?</label>
            <textarea
              id="problem-description"
              value={description}
              onChange={event => setDescription(event.target.value)}
              maxLength={2000}
              rows={5}
              autoFocus
              placeholder="Example: I said next, but the app repeated the same item."
              className="w-full resize-none rounded-xl border border-gray-700 bg-gray-900 p-3 text-base text-white outline-none focus:border-teal-500"
            />
            <div className="mt-4 flex gap-3">
              <Button variant="outline" onClick={close} className="flex-1">Cancel</Button>
              <Button onClick={() => void submit()} disabled={description.trim().length < 3 || state === 'sending'} className="flex-1 bg-teal-600 hover:bg-teal-700">
                {state === 'sending'
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending</>
                  : 'Send report'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
