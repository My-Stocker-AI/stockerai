import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isReportSource, type ReportSource } from '@/lib/onboarding';

interface OnboardingRecord {
  onboarding_completed_at: string | null;
  report_format_status?: string;
  report_source?: string | null;
  report_source_name?: string | null;
}

export const useOnboardingStatus = () => {
  const { user, userRole } = useAuth();
  const isAdmin = userRole?.role === 'primary_admin';
  const targetId = isAdmin ? userRole?.account_id : user?.id;

  const query = useQuery({
    queryKey: ['onboarding-status', isAdmin ? 'account' : 'profile', targetId],
    queryFn: async () => {
      if (!targetId) return null;

      if (isAdmin) {
        const { data, error } = await supabase
          .from('accounts')
          .select('onboarding_completed_at, report_source, report_source_name, report_format_status')
          .eq('id', targetId)
          .single();
        if (error) throw error;
        return data as OnboardingRecord;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_completed_at')
        .eq('id', targetId)
        .single();
      if (error) throw error;
      return data as OnboardingRecord;
    },
    enabled: !!targetId,
    staleTime: 60_000,
  });

  const storedSource = query.data?.report_source;

  return {
    ...query,
    isAdmin,
    needsOnboarding: !!query.data && !query.data.onboarding_completed_at,
    reportSource: storedSource && isReportSource(storedSource) ? storedSource : null as ReportSource | null,
    reportSourceName: query.data?.report_source_name || '',
    reportFormatStatus: query.data?.report_format_status || null,
  };
};
