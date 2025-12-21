import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signInWithAzure: () => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  updatePassword: (newPassword: string) => Promise<{ error: any }>;
  verifyOtp: (tokenHash: string, type: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    // Call edge function which will create user and send branded email with proper token
    try {
      const response = await supabase.functions.invoke('send-auth-email', {
        body: {
          type: 'signup',
          email: email,
          password: password
        }
      });

      if (response.error) {
        console.error("Signup error:", response.error);
        return { error: response.error };
      }

      if (response.data?.error) {
        console.error("Signup error from function:", response.data.error);
        return { error: { message: response.data.error } };
      }

      return { error: null };
    } catch (e: any) {
      console.error("Signup exception:", e);
      return { error: { message: e.message || "Failed to create account" } };
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'https://pronghorn.red/dashboard',
        skipBrowserRedirect: false,
      }
    });
    return { error };
  };

  const signInWithAzure = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: 'https://pronghorn.red/dashboard',
        scopes: 'openid profile email',
        skipBrowserRedirect: false,
      }
    });
    return { error };
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      
      // If server signout failed (e.g., session_not_found), force local signout
      if (error) {
        console.warn("Server signout failed, clearing local session:", error.message);
        await supabase.auth.signOut({ scope: 'local' });
      }
    } catch (e) {
      // Catch any unexpected errors and still clear local state
      console.warn("Signout error, clearing local session:", e);
      await supabase.auth.signOut({ scope: 'local' });
    }
    
    // Explicitly clear state to ensure UI updates
    setUser(null);
    setSession(null);
  };

  const resetPassword = async (email: string) => {
    // Call edge function which will generate recovery link and send branded email
    try {
      const response = await supabase.functions.invoke('send-auth-email', {
        body: {
          type: 'recovery',
          email: email
        }
      });

      if (response.error) {
        console.error("Password reset error:", response.error);
        return { error: response.error };
      }

      if (response.data?.error) {
        console.error("Password reset error from function:", response.data.error);
        return { error: { message: response.data.error } };
      }

      return { error: null };
    } catch (e: any) {
      console.error("Password reset exception:", e);
      return { error: { message: e.message || "Failed to send reset email" } };
    }
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    return { error };
  };

  const verifyOtp = async (tokenHash: string, type: string) => {
    // Verify the OTP token from email link
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'signup' | 'recovery' | 'email',
    });
    return { error };
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      signUp, 
      signIn, 
      signInWithGoogle, 
      signInWithAzure, 
      signOut, 
      resetPassword, 
      updatePassword,
      verifyOtp 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
