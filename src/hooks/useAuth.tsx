import { useState, useEffect, createContext, useContext, ReactNode, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { clearPasswordFlow } from '@/lib/authRecovery';

interface UserRole {
  role: 'primary_admin' | 'driver';
  can_view_all_routes: boolean;
  account_id: string;
}

interface UserProfile {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: UserRole | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, firstName: string, lastName: string, driverCount?: number) => Promise<{ error: Error | null; requiresEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const identityGeneration = useRef(0);
  const currentUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchUserRole = async (userId: string) => {
      const { data, error } = await supabase
        .from('account_users')
        .select('role, can_view_all_routes, account_id')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching user role:', error);
        return null;
      }

      return data as UserRole;
    };

    const fetchUserProfile = async (userId: string) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        return null;
      }

      return data as UserProfile;
    };

    const applySession = (nextSession: Session | null) => {
      const generation = ++identityGeneration.current;
      const nextUser = nextSession?.user ?? null;
      const nextUserId = nextUser?.id ?? null;
      const identityChanged = currentUserId.current !== nextUserId;

      currentUserId.current = nextUserId;
      setSession(nextSession);
      setUser(nextUser);

      if (identityChanged) {
        // Never display metadata or cached account data from the preceding identity while
        // the new identity is being resolved.
        setUserRole(null);
        setUserProfile(null);
        queryClient.clear();
        setLoading(nextUser !== null);
      }

      if (!nextUser) {
        setUserRole(null);
        setUserProfile(null);
        setLoading(false);
        return;
      }

      const loadMetadata = async () => {
        const [role, profile] = await Promise.all([
          fetchUserRole(nextUser.id),
          fetchUserProfile(nextUser.id),
        ]);

        if (!active || generation !== identityGeneration.current) return;
        setUserRole(role);
        setUserProfile(profile);
        setLoading(false);
      };

      // Supabase advises against awaiting additional Supabase calls directly inside its
      // auth callback. Deferring also gives a newer identity event a chance to supersede
      // this load before any result is applied.
      setTimeout(() => void loadMetadata(), 0);
    };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => applySession(nextSession)
    );

    // THEN check for existing session
    const initialSessionGeneration = identityGeneration.current;
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      // A sign-in/sign-out event that arrived while getSession was pending is newer than
      // this snapshot and must win even if the snapshot resolves last.
      if (active && identityGeneration.current === initialSessionGeneration) {
        applySession(existingSession);
      }
    });

    return () => {
      active = false;
      identityGeneration.current += 1;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const signIn = async (email: string, password: string) => {
    clearPasswordFlow();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (
    email: string, 
    password: string, 
    firstName: string, 
    lastName: string,
    driverCount: number = 2
  ) => {
    const redirectUrl = `${window.location.origin}/dashboard`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          first_name: firstName,
          last_name: lastName,
          driver_count: driverCount,
          stocker_account_signup: true,
        }
      }
    });

    if (error) {
      return { error: error as Error, requiresEmailConfirmation: false };
    }

    if (!data.user) {
      return { error: new Error('Account creation did not return a user'), requiresEmailConfirmation: false };
    }

    return { error: null, requiresEmailConfirmation: !data.session };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    identityGeneration.current += 1;
    currentUserId.current = null;
    clearPasswordFlow();
    setUser(null);
    setSession(null);
    setUserRole(null);
    setUserProfile(null);
    setLoading(false);
    queryClient.clear();
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });
    return { error: error as Error | null };
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      userRole,
      userProfile,
      loading,
      signIn,
      signUp,
      signOut,
      resetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
