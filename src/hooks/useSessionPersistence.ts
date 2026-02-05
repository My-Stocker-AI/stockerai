import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const DB_NAME = 'stocker-sessions';
const STORE_NAME = 'active-session';
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface SessionData {
  id?: string;
  sessionId: string;
  userId: string | null;
  routeId: string | null;
  routeName: string | null;
  routeDate: string | null;
  totalMachines: number;
  currentMachineIndex: number;
  currentMachineId: string | null;
  currentMachineName: string | null;
  currentMachineTotalItems?: number;  // Total items on current machine (from DB)
  currentMachineItemsRemaining?: number;  // Remaining items (from workflow)
  currentItem: any;
  currentItem2?: any;  // Second item in 2-pick mode
  completedItems: any[];
  machines: any[];  // CRITICAL FIX: Persist per-machine progress for dropdown
  completed: boolean;
  conversationHistory: any[];
  savedAt?: number;
  pendingMachineTransition?: {  // Machine awaiting direction response
    nextMachineId: string;
    nextMachineName: string;
    nextMachineIndex: number;
  } | null;
  pickDirection?: string | null;  // Route-level direction preference: "forward" or "reverse"
}

export function useSessionPersistence() {
  const dbRef = useRef<IDBDatabase | null>(null);

  const openDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      if (dbRef.current) {
        resolve(dbRef.current);
        return;
      }

      const request = indexedDB.open(DB_NAME, 1);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        dbRef.current = request.result;
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }, []);

  const saveLocal = useCallback(async (data: SessionData): Promise<void> => {
    const maxRetries = 3;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const record = { ...data, id: 'current', savedAt: Date.now() };
          store.put(record);
          tx.oncomplete = () => resolve(undefined);
          tx.onerror = () => reject(tx.error);
        });
        console.log(`[Session] Local save successful (attempt ${attempt})`);
        return; // Success - exit retry loop
      } catch (e) {
        lastError = e;
        console.warn(`[Session] Local save failed (attempt ${attempt}/${maxRetries}):`, e);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 100 * attempt)); // Exponential backoff
        }
      }
    }

    // All retries failed - throw error to alert user
    throw new Error(`Failed to save session after ${maxRetries} attempts: ${lastError}`);
  }, [openDB]);

  const loadLocal = useCallback(async (): Promise<SessionData | null> => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get('current');
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('[Session] Local load error:', e);
      return null;
    }
  }, [openDB]);

  const clearLocal = useCallback(async (): Promise<void> => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete('current');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.error('[Session] Local clear error:', e);
    }
  }, [openDB]);

  // Save minimal session metadata to Supabase sessions table for backend workflow tracking
  const saveToServer = useCallback(async (data: SessionData, userId: string): Promise<void> => {
    try {
      const sessionKey = `${userId}-${data.routeId || 'active'}`;
      
      // Check if session exists
      const { data: existing } = await supabase
        .from('sessions')
        .select('id')
        .eq('session_key', sessionKey)
        .eq('user_id', userId)
        .maybeSingle();

      const sessionRecord = {
        session_key: sessionKey,
        user_id: userId,
        current_route_id: data.routeId,
        current_machine_id: data.currentMachineId,
        pick_direction: data.pickDirection || null,
        // REMOVED: current_item_index - managed exclusively by n8n workflows
        // Frontend was incorrectly writing currentMachineIndex (machine number) to current_item_index (item sequence)
        // This caused machine to complete after only 2 items because index was corrupted to 1 instead of 24
        status: data.completed ? 'completed' : 'stocking',
        updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        await supabase
          .from('sessions')
          .update(sessionRecord)
          .eq('id', existing.id);
      } else {
        // Only INSERT if we have a route - don't create sessions without routes
        if (!data.routeId) {
          console.log('[Session] Skipping INSERT - no route selected yet');
          return;
        }
        await supabase
          .from('sessions')
          .insert({
            ...sessionRecord,
            started_at: new Date().toISOString(),
          });
      }
      
      console.log('[Session] Saved to server for workflow tracking');
    } catch (e) {
      console.error('[Session] Server save error:', e);
    }
  }, []);

  const loadFromServer = useCallback(async (userId: string): Promise<SessionData | null> => {
    try {
      // Find the most recent in-progress session
      const { data: session, error } = await supabase
        .from('sessions')
        .select(`
          *,
          routes:current_route_id (
            id,
            route_name,
            delivery_date,
            total_machines
          ),
          machines:current_machine_id (
            id,
            machine_name
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'stocking')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !session) return null;

      // Convert server session to local format
      const route = session.routes as any;
      const machine = session.machines as any;

      // SYSTEMIC FIX: Removed current_item_index reference
      // currentMachineIndex is machine position in route (1st, 2nd, 3rd)
      // This will be determined by workflow, not stored in session
      return {
        sessionId: session.id,
        userId: session.user_id,
        routeId: session.current_route_id,
        routeName: route?.route_name || null,
        routeDate: session.delivery_date,
        totalMachines: route?.total_machines || 0,
        currentMachineIndex: 0, // Will be updated by workflow when route loads
        currentMachineId: session.current_machine_id,
        currentMachineName: machine?.machine_name || null,
        currentItem: null, // Will be reloaded from DB
        completedItems: [],
        machines: [], // Will be populated from route data
        completed: session.status === 'completed',
        conversationHistory: [],
        savedAt: new Date(session.updated_at || session.created_at).getTime(),
        pickDirection: session.pick_direction || null,
      };
    } catch (e) {
      console.error('[Session] Server load error:', e);
      return null;
    }
  }, []);

  const clearServer = useCallback(async (userId: string): Promise<void> => {
    try {
      console.log('[Session] clearServer called for userId:', userId);

      // STEP 1: Get current route_id BEFORE deleting session
      const { data: sessions, error: fetchError } = await supabase
        .from('sessions')
        .select('current_route_id')
        .eq('user_id', userId)
        .eq('status', 'stocking')
        .limit(1);

      if (fetchError) {
        console.error('[Session] Failed to fetch session for route_id:', fetchError);
      }

      const routeId = sessions && sessions.length > 0 ? sessions[0].current_route_id : null;

      // STEP 2: Reset machines for this route (completed_items → 0, status → pending)
      if (routeId) {
        console.log('[Session] Resetting machines for route:', routeId);
        const { error: machinesError } = await supabase
          .from('machines')
          .update({
            completed_items: 0,
            status: 'pending'
          })
          .eq('route_id', routeId);

        if (machinesError) {
          console.error('[Session] Failed to reset machines:', machinesError);
          throw machinesError;
        }
        console.log('[Session] ✅ Reset all machines to completed_items=0');
      }

      // STEP 3: DELETE all sessions for this user with .select() to verify
      const { error, data } = await supabase
        .from('sessions')
        .delete()
        .eq('user_id', userId)
        .select(); // Returns deleted rows

      if (error) {
        console.error('[Session] DELETE failed:', error);
        throw error; // Throw to prevent page reload if delete failed
      }

      // Verify deletion
      if (data && data.length > 0) {
        console.log(`[Session] ✅ Deleted ${data.length} session(s) from Supabase`);
        console.log('[Session] Deleted session IDs:', data.map((s: any) => s.id));
      } else {
        console.log('[Session] ⚠️ No sessions found to delete (might be already clear)');
      }

      // Double-check sessions are gone
      const { data: remaining, error: checkError } = await supabase
        .from('sessions')
        .select('id')
        .eq('user_id', userId);

      if (!checkError && remaining && remaining.length > 0) {
        console.error('[Session] ❌ WARNING: Sessions still exist after delete!', remaining);
        throw new Error(`Failed to delete all sessions. ${remaining.length} remaining.`);
      }

      console.log('[Session] ✅ Verified: No sessions remaining in database');
    } catch (e) {
      console.error('[Session] Server clear error:', e);
      throw e; // Re-throw to stop reset process
    }
  }, []);

  const save = useCallback(async (data: SessionData, userId: string | null): Promise<void> => {
    await saveLocal(data);
    if (userId) {
      // Non-blocking server save for backend workflow tracking
      saveToServer(data, userId);
    }
  }, [saveLocal, saveToServer]);

  const load = useCallback(async (userId: string | null): Promise<SessionData | null> => {
    // CRITICAL FIX: IndexedDB is single source of truth for F5 refresh
    // loadFromServer() returns hardcoded empty arrays for completedItems/machines
    // which causes Done card and progress bar to be empty after F5
    // IndexedDB has ALL the data (completedItems, machines, currentItem, conversationHistory)
    return loadLocal();
  }, [loadLocal]);

  const clear = useCallback(async (userId: string | null): Promise<void> => {
    await clearLocal();
    if (userId) {
      await clearServer(userId);
    }
  }, [clearLocal, clearServer]);

  const isValidSession = useCallback((data: SessionData | null): boolean => {
    if (!data || !data.savedAt) return false;
    if (Date.now() - data.savedAt > SESSION_EXPIRY_MS) return false;
    if (!data.routeName && !data.routeId) return false;
    return true;
  }, []);

  return {
    save,
    load,
    clear,
    isValidSession
  };
}
