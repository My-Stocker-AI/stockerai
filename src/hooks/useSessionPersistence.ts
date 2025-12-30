import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const DB_NAME = 'stocker-sessions';
const STORE_NAME = 'active-session';
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface SessionData {
  id?: string;
  sessionId: string;
  userId: string | null;
  routeName: string | null;
  routeDate: string | null;
  totalMachines: number;
  currentMachineIndex: number;
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

  const saveToServer = useCallback(async (data: SessionData, userId: string): Promise<void> => {
    if (!userId) return;
    try {
      const { error } = await supabase
        .from('pwa_sessions')
        .upsert({
          user_id: userId,
          session_data: JSON.stringify(data),
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) {
        console.log('[Session] Server save skipped:', error.message);
      } else {
        console.log('[Session] Saved to server');
      }
    } catch (e: any) {
      console.log('[Session] Server save error:', e.message);
    }
  }, []);

  const loadFromServer = useCallback(async (userId: string): Promise<SessionData | null> => {
    if (!userId) return null;
    try {
      const { data, error } = await supabase
        .from('pwa_sessions')
        .select('session_data, updated_at')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        console.log('[Session] No server session found');
        return null;
      }

      const sessionData = JSON.parse(data.session_data);
      sessionData.savedAt = new Date(data.updated_at).getTime();
      console.log('[Session] Loaded from server');
      return sessionData;
    } catch (e: any) {
      console.log('[Session] Server load error:', e.message);
      return null;
    }
  }, []);

  const clearServer = useCallback(async (userId: string): Promise<void> => {
    if (!userId) return;
    try {
      await supabase
        .from('pwa_sessions')
        .delete()
        .eq('user_id', userId);
      console.log('[Session] Cleared from server');
    } catch (e: any) {
      console.log('[Session] Server clear error:', e.message);
    }
  }, []);

  const save = useCallback(async (data: SessionData, userId: string | null): Promise<void> => {
    await saveLocal(data);
    if (userId) {
      // Non-blocking server save
      saveToServer(data, userId);
    }
  }, [saveLocal, saveToServer]);

  const load = useCallback(async (userId: string | null): Promise<SessionData | null> => {
    // Try server first (allows cross-device sync)
    if (userId) {
      const serverData = await loadFromServer(userId);
      if (serverData) return serverData;
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
    if (!data.routeName) return false;
    return true;
  }, []);

  return {
    save,
    load,
    clear,
    isValidSession
  };
}
