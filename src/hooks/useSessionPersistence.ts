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

  // Server sync is disabled until pwa_sessions table is created
  // For now, sessions are stored locally in IndexedDB only
  const saveToServer = useCallback(async (_data: SessionData, _userId: string): Promise<void> => {
    // Server sync disabled - using IndexedDB only
    console.log('[Session] Server sync disabled, using local storage only');
  }, []);

  const loadFromServer = useCallback(async (_userId: string): Promise<SessionData | null> => {
    // Server sync disabled - using IndexedDB only
    return null;
  }, []);

  const clearServer = useCallback(async (_userId: string): Promise<void> => {
    // Server sync disabled - using IndexedDB only
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
