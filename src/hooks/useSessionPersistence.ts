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
  currentItem: any;
  completedItems: any[];
  completed: boolean;
  conversationHistory: any[];
  savedAt?: number;
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
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record = { ...data, id: 'current', savedAt: Date.now() };
        store.put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.error('[Session] Local save error:', e);
    }
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
        current_item_index: data.currentMachineIndex,
        delivery_date: data.routeDate,
        status: data.completed ? 'completed' : 'in_progress',
        updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        await supabase
          .from('sessions')
          .update(sessionRecord)
          .eq('id', existing.id);
      } else {
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
        .eq('status', 'in_progress')
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
      // Mark all in-progress sessions as completed
      await supabase
        .from('sessions')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('status', 'in_progress');
        
      console.log('[Session] Cleared server sessions');
    } catch (e) {
      console.error('[Session] Server clear error:', e);
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
      clearServer(userId);
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
