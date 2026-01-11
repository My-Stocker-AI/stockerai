import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Keyword Learning Hook
 *
 * Tracks user-specific vocabulary to improve voice recognition over time.
 * - Success: AI understood and executed correctly
 * - Failure: User said "undo", "repeat", or AI asked for clarification
 *
 * Keywords with confidence > 0.60 are automatically added to Deepgram vocabulary.
 */

// Common stop words to ignore (don't track these)
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
  'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'can', 'will', 'just', 'should', 'now', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those'
]);

// Base commands (don't track as product keywords)
const BASE_COMMANDS = new Set([
  'next', 'done', 'skip', 'yes', 'no', 'start', 'stop', 'continue',
  'undo', 'back', 'repeat', 'again', 'switch', 'route', 'machine',
  'top', 'bottom', 'beginning', 'end', 'north', 'south', 'east', 'west',
  'what', 'how', 'many', 'left', 'go', 'progress', 'status'
]);

interface UseKeywordLearningReturn {
  /**
   * Track a keyword from transcript
   * @param transcript - What the user said
   * @param wasSuccess - True if AI understood correctly, false if user corrected/repeated
   */
  trackKeywords: (transcript: string, wasSuccess: boolean) => Promise<void>;

  /**
   * Get user's learned keywords with high confidence
   * @param minConfidence - Minimum confidence score (default 0.60)
   * @param limit - Max keywords to return (default 50)
   */
  getUserKeywords: (minConfidence?: number, limit?: number) => Promise<string[]>;

  /**
   * Get global keywords (across all users)
   * @param minConfidence - Minimum confidence score (default 0.60)
   * @param limit - Max keywords to return (default 50)
   */
  getGlobalKeywords: (minConfidence?: number, limit?: number) => Promise<string[]>;
}

export function useKeywordLearning(): UseKeywordLearningReturn {
  /**
   * Extract meaningful keywords from transcript
   */
  const extractKeywords = useCallback((transcript: string): string[] => {
    // Normalize: lowercase, remove punctuation
    const normalized = transcript
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .trim();

    // Split into words
    const words = normalized.split(/\s+/).filter(word => {
      // Filter out:
      // - Stop words (the, a, an, etc.)
      // - Base commands (next, done, skip, etc.)
      // - Very short words (< 3 chars)
      // - Numbers only
      return (
        word.length >= 3 &&
        !STOP_WORDS.has(word) &&
        !BASE_COMMANDS.has(word) &&
        !/^\d+$/.test(word) // Not just numbers
      );
    });

    // Return unique keywords
    return Array.from(new Set(words));
  }, []);

  /**
   * Track keywords from user transcript
   */
  const trackKeywords = useCallback(async (transcript: string, wasSuccess: boolean) => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('[KeywordLearning] No user logged in, skipping tracking');
        return;
      }

      // Extract keywords
      const keywords = extractKeywords(transcript);
      if (keywords.length === 0) {
        console.log('[KeywordLearning] No trackable keywords in transcript:', transcript);
        return;
      }

      console.log('[KeywordLearning] Tracking keywords:', keywords, 'success:', wasSuccess);

      // Track each keyword
      for (const keyword of keywords) {
        const { error } = await supabase.rpc('upsert_user_keyword', {
          p_user_id: user.id,
          p_keyword: keyword,
          p_success: wasSuccess
        });

        if (error) {
          console.error('[KeywordLearning] Error tracking keyword:', keyword, error);
        }
      }

      console.log('[KeywordLearning] Successfully tracked', keywords.length, 'keywords');
    } catch (error) {
      console.error('[KeywordLearning] trackKeywords error:', error);
    }
  }, [extractKeywords]);

  /**
   * Get user's high-confidence keywords
   */
  const getUserKeywords = useCallback(async (
    minConfidence: number = 0.60,
    limit: number = 50
  ): Promise<string[]> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('[KeywordLearning] No user logged in, returning empty keywords');
        return [];
      }

      const { data, error } = await supabase.rpc('get_top_user_keywords', {
        p_user_id: user.id,
        p_min_confidence: minConfidence,
        p_limit: limit
      });

      if (error) {
        console.error('[KeywordLearning] Error fetching user keywords:', error);
        return [];
      }

      const keywords = data?.map((row: any) => row.keyword) || [];
      console.log('[KeywordLearning] Fetched', keywords.length, 'user keywords');
      return keywords;
    } catch (error) {
      console.error('[KeywordLearning] getUserKeywords error:', error);
      return [];
    }
  }, []);

  /**
   * Get global high-confidence keywords
   */
  const getGlobalKeywords = useCallback(async (
    minConfidence: number = 0.60,
    limit: number = 50
  ): Promise<string[]> => {
    try {
      const { data, error } = await supabase
        .from('global_keywords')
        .select('keyword')
        .gte('confidence_score', minConfidence)
        .order('confidence_score', { ascending: false })
        .order('user_count', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[KeywordLearning] Error fetching global keywords:', error);
        return [];
      }

      const keywords = data?.map((row) => row.keyword) || [];
      console.log('[KeywordLearning] Fetched', keywords.length, 'global keywords');
      return keywords;
    } catch (error) {
      console.error('[KeywordLearning] getGlobalKeywords error:', error);
      return [];
    }
  }, []);

  return {
    trackKeywords,
    getUserKeywords,
    getGlobalKeywords
  };
}
