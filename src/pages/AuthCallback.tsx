import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  authCallbackValue,
  passwordFlowFromUrl,
  rememberPasswordFlow,
} from '@/lib/authRecovery';

/**
 * Auth Callback Handler
 *
 * Handles Supabase auth redirects:
 * - Invite emails (type=invite) → /set-password
 * - Email confirmations → /dashboard
 * - Password resets → /set-password
 * - Magic links → /dashboard
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const search = window.location.search;
        const hash = window.location.hash;
        const passwordFlow = passwordFlowFromUrl(search, hash);

        // Check for error from Supabase
        const error = authCallbackValue('error', search, hash);
        const errorDescription = authCallbackValue('error_description', search, hash);

        if (error) {
          console.error('[AuthCallback] Supabase auth error:', error, errorDescription);
          navigate('/login?error=' + encodeURIComponent(errorDescription || error));
          return;
        }

        // Implicit links are detected by the client. PKCE links carry a one-time code and
        // require an explicit exchange when no session has been established yet.
        let { data: { session }, error: sessionError } = await supabase.auth.getSession();

        const code = searchParams.get('code');
        if (!session && !sessionError && code) {
          const exchanged = await supabase.auth.exchangeCodeForSession(code);
          session = exchanged.data.session;
          sessionError = exchanged.error;
        }

        if (sessionError) {
          console.error('[AuthCallback] Session error:', sessionError);
          navigate('/login?error=session_error');
          return;
        }

        if (passwordFlow) {
          if (!session) {
            navigate('/login?error=recovery_session_missing', { replace: true });
            return;
          }
          rememberPasswordFlow(passwordFlow);
          navigate('/set-password', { replace: true });
        } else if (session) {
          // User is authenticated - go to dashboard
          console.log('[AuthCallback] User authenticated - redirecting to dashboard');
          navigate('/dashboard', { replace: true });
        } else {
          // No session, no specific type - go to login
          console.log('[AuthCallback] No session found - redirecting to login');
          navigate('/login', { replace: true });
        }
      } catch (error) {
        console.error('[AuthCallback] Unexpected error:', error);
        navigate('/login?error=unexpected_error');
      }
    };

    handleAuthCallback();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Completing authentication...</p>
      </div>
    </div>
  );
}
