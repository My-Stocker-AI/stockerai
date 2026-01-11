import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

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
        // Get the type parameter from URL
        const type = searchParams.get('type');

        // Check for error from Supabase
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (error) {
          console.error('[AuthCallback] Supabase auth error:', error, errorDescription);
          navigate('/login?error=' + encodeURIComponent(errorDescription || error));
          return;
        }

        // Get the session (handles hash-based tokens automatically)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('[AuthCallback] Session error:', sessionError);
          navigate('/login?error=session_error');
          return;
        }

        // Route based on type parameter
        if (type === 'invite') {
          console.log('[AuthCallback] Invite flow - redirecting to set-password');
          navigate('/set-password', { replace: true });
        } else if (type === 'recovery' || type === 'reset_password') {
          console.log('[AuthCallback] Password recovery - redirecting to set-password');
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
