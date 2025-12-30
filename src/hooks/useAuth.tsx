import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

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
  signUp: (email: string, password: string, firstName: string, lastName: string, driverCount?: number) => Promise<{ error: Error | null }>;
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

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer role/profile fetch with setTimeout to prevent deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchUserRole(session.user.id).then(setUserRole);
            fetchUserProfile(session.user.id).then(setUserProfile);
          }, 0);
        } else {
          setUserRole(null);
          setUserProfile(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // Wait for both role and profile to load before setting loading=false
        const [role, profile] = await Promise.all([
          fetchUserRole(session.user.id),
          fetchUserProfile(session.user.id)
        ]);
        setUserRole(role);
        setUserProfile(profile);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
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
        }
      }
    });

    if (error) {
      return { error: error as Error };
    }

    // After successful signup, create account and account_user
    if (data.user) {
      // Update profiles with first/last name
      await supabase
        .from('profiles')
        .update({ 
          first_name: firstName, 
          last_name: lastName 
        })
        .eq('id', data.user.id);

      // Create account
      const { data: accountData, error: accountError } = await supabase
        .from('accounts')
        .insert({
          name: `${firstName}'s Company`,
          driver_count: driverCount,
        })
        .select()
        .single();

      if (accountError) {
        console.error('Error creating account:', accountError);
        return { error: new Error('Failed to create account') };
      }

      // Create account_user as primary_admin
      const { error: roleError } = await supabase
        .from('account_users')
        .insert({
          account_id: accountData.id,
          user_id: data.user.id,
          role: 'primary_admin',
          can_view_all_routes: true,
        });

      if (roleError) {
        console.error('Error creating account user:', roleError);
        return { error: new Error('Failed to set up user role') };
      }
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRole(null);
    setUserProfile(null);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
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
