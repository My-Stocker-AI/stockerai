import { useCallback, useRef } from 'react';
import { authFetch } from '@/lib/authFetch';

/**
 * Priority 3: Client-Side Item Prefetching
 *
 * After receiving item N, prefetch items N+1, N+2, N+3 in background.
 * When user says "next", check cache first for instant response (0ms latency).
 *
 * Cache key format: `${sessionId}_${itemIndex}`
 */

interface CachedItem {
  result: any;
  timestamp: number;
  itemIndex: number;
}

const CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const PREFETCH_COUNT = 3; // Prefetch next 3 items

export function useItemCache() {
  // In-memory cache (faster than localStorage)
  const cacheRef = useRef<Map<string, CachedItem>>(new Map());

  /**
   * Get item from cache if available and not expired
   */
  const getCachedItem = useCallback((sessionId: string, itemIndex: number): any | null => {
    const key = `${sessionId}_${itemIndex}`;
    const cached = cacheRef.current.get(key);

    if (!cached) {
      console.log('[ItemCache] Cache miss:', key);
      return null;
    }

    const age = Date.now() - cached.timestamp;
    if (age > CACHE_EXPIRY_MS) {
      console.log('[ItemCache] Cache expired:', key, `(${Math.round(age / 1000)}s old)`);
      cacheRef.current.delete(key);
      return null;
    }

    console.log('[ItemCache] ✨ Cache hit:', key, `(${Math.round(age / 1000)}s old)`);
    return cached.result;
  }, []);

  /**
   * Store item in cache
   */
  const setCachedItem = useCallback((sessionId: string, itemIndex: number, result: any) => {
    const key = `${sessionId}_${itemIndex}`;
    cacheRef.current.set(key, {
      result,
      timestamp: Date.now(),
      itemIndex
    });
    console.log('[ItemCache] Cached item:', key);
  }, []);

  /**
   * Prefetch next N items in background (fire-and-forget)
   */
  const prefetchNextItems = useCallback(async (
    sessionId: string,
    currentItemIndex: number,
    userId: string,
    N8N_BASE: string
  ) => {
    console.log('[ItemCache] 🚀 Starting prefetch from index:', currentItemIndex + 1);

    for (let i = 1; i <= PREFETCH_COUNT; i++) {
      const nextIndex = currentItemIndex + i;
      const key = `${sessionId}_${nextIndex}`;

      // Skip if already cached
      if (cacheRef.current.has(key)) {
        console.log('[ItemCache] Already cached, skipping:', key);
        continue;
      }

      // Fire-and-forget fetch (don't await)
      // Use /get-next-item for Python API, /next-item-optimized for n8n
      const nextItemPath = N8N_BASE.includes('render.com') ? '/get-next-item' : '/next-item-optimized';
      // Carries the login exactly like the foreground call. Without it the prefetch would
      // be refused every time while the real call succeeded — a cache that silently never
      // fills, showing up only as the voice feeling slower than it should.
      authFetch(`${N8N_BASE}${nextItemPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          user_id: userId
        })
      })
        .then(async (resp) => {
          if (!resp.ok) {
            console.warn('[ItemCache] Prefetch failed for', key, ':', resp.status);
            return;
          }
          const result = await resp.json();

          // Only cache if it's actually an item (not next_machine or route_complete)
          if (result.action === 'next_item') {
            setCachedItem(sessionId, nextIndex, result);
            console.log('[ItemCache] ✅ Prefetched:', key, '-', result.product_name);
          } else {
            console.log('[ItemCache] Skipping cache - action is:', result.action);
          }
        })
        .catch((e) => {
          console.warn('[ItemCache] Prefetch error for', key, ':', e.message);
        });
    }
  }, [setCachedItem]);

  /**
   * Clear cache for a session (e.g., when switching routes)
   */
  const clearCache = useCallback((sessionId?: string) => {
    if (sessionId) {
      // Clear specific session
      const keysToDelete: string[] = [];
      cacheRef.current.forEach((_, key) => {
        if (key.startsWith(sessionId)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => cacheRef.current.delete(key));
      console.log('[ItemCache] Cleared cache for session:', sessionId, `(${keysToDelete.length} items)`);
    } else {
      // Clear all
      const size = cacheRef.current.size;
      cacheRef.current.clear();
      console.log('[ItemCache] Cleared entire cache:', `(${size} items)`);
    }
  }, []);

  /**
   * Get cache stats for debugging
   */
  const getCacheStats = useCallback(() => {
    const now = Date.now();
    const stats = {
      totalItems: cacheRef.current.size,
      sessions: new Set<string>(),
      oldestItem: 0,
      newestItem: 0
    };

    cacheRef.current.forEach((item, key) => {
      const sessionId = key.split('_')[0];
      stats.sessions.add(sessionId);

      const age = now - item.timestamp;
      if (stats.oldestItem === 0 || age > stats.oldestItem) {
        stats.oldestItem = age;
      }
      if (stats.newestItem === 0 || age < stats.newestItem) {
        stats.newestItem = age;
      }
    });

    return {
      ...stats,
      sessionCount: stats.sessions.size,
      oldestItemAge: Math.round(stats.oldestItem / 1000),
      newestItemAge: Math.round(stats.newestItem / 1000)
    };
  }, []);

  return {
    getCachedItem,
    setCachedItem,
    prefetchNextItems,
    clearCache,
    getCacheStats
  };
}
