import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  authCallbackValue,
  passwordFlowFromUrl,
  rememberPasswordFlow,
} from '@/lib/authRecovery';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { withTimeout } from '@/lib/withTimeout';

export const AUTH_CALLBACK_TIMEOUT_MS = 15_000;
const CALLBACK_ERROR = 'We confirmed your email, but could not finish opening StockerAI.';

/**
 * Auth Callback Handler
 *
 * Handles Supabase auth redirects:
 * - Invite emails (type=invite) → /set-password
 * - Email confirmations → billing setup (new accounts are card-gated there)
 * - Password resets → /set-password
 * - Magic links → /dashboard
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setErrorMessage(null);
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    let active = true;

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
        const sessionResult = await withTimeout((async () => {
          let result = await supabase.auth.getSession();
          const code = searchParams.get('code');
          if (!result.data.session && !result.error && code) {
            result = await supabase.auth.exchangeCodeForSession(code);
          }
          return result;
        })(), AUTH_CALLBACK_TIMEOUT_MS, CALLBACK_ERROR);

        if (!active) return;
        const { data: { session }, error: sessionError } = sessionResult;

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
          const isNewCompanySignup = searchParams.get('type') === 'signup';
          // New companies continue to card setup. Invite, magic-link and ordinary
          // callbacks retain their existing destination and are still protected by
          // the account-level billing gate if appropriate.
          console.log('[AuthCallback] User authenticated');
          navigate(isNewCompanySignup ? '/dashboard/billing?setup=required' : '/dashboard', { replace: true });
        } else {
          // No session, no specific type - go to login
          console.log('[AuthCallback] No session found - redirecting to login');
          navigate('/login', { replace: true });
        }
      } catch (error) {
        console.error('[AuthCallback] Unexpected error:', error);
        if (active) setErrorMessage(CALLBACK_ERROR);
      }
    };

    void handleAuthCallback();
    return () => { active = false; };
  }, [attempt, navigate, searchParams]);

  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-lg border bg-white p-6 text-center shadow-sm">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">We could not finish signing you in</h1>
          <p className="text-gray-600 mb-6">
            Your confirmation may already be complete. Check your connection, then try again.
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={retry}>Try again</Button>
            <Button variant="outline" onClick={() => navigate('/login', { replace: true })}>
              Go to sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-gray-600">Completing authentication...</p>
      </div>
    </div>
  );
}
