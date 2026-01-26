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

  // Save session to Supabase sessions table for cross-device sync
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
      
      console.log('[Session] Saved to server for cross-device sync');
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
      
      return {
        sessionId: session.id,
        userId: session.user_id,
        routeId: session.current_route_id,
        routeName: route?.route_name || null,
        routeDate: session.delivery_date,
        totalMachines: route?.total_machines || 0,
        currentMachineIndex: session.current_item_index || 0,
        currentMachineId: session.current_machine_id,
        currentMachineName: machine?.machine_name || null,
        currentItem: null, // Will be reloaded from DB
        completedItems: [],
        completed: session.status === 'completed',
        conversationHistory: [],
        savedAt: new Date(session.updated_at || session.created_at).getTime(),
      };
    } catch (e) {
      console.error('[Session] Server load error:', e);
      return null;
    }
  }, []);

  const clearServer = useCallback(async (userId: string): Promise<void> => {
    try {
      console.log('[Session] clearServer called for userId:', userId);

      // DELETE all sessions for this user with .select() to verify
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
      // Non-blocking server save for cross-device sync
      saveToServer(data, userId);
    }
  }, [saveLocal, saveToServer]);

  const load = useCallback(async (userId: string | null): Promise<SessionData | null> => {
    // Try server first (allows cross-device sync)
    if (userId) {
      const serverData = await loadFromServer(userId);
      if (serverData && serverData.routeId) {
        console.log('[Session] Loaded from server (cross-device sync)');
        return serverData;
      }
    }
    // Fallback to IndexedDB
    return loadLocal();
  }, [loadFromServer, loadLocal]);

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
