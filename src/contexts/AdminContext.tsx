import { createContext, useContext, ReactNode } from "react";
import { useAdminRole } from "@/hooks/useAdminRole";
import { supabase } from "@/integrations/supabase/client";

interface AdminContextType {
  isAdmin: boolean;
  isLoading: boolean;
  user: any;
  requestAdminAccess: (key?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const { isAdmin, isLoading, user, refreshRole } = useAdminRole();

  const requestAdminAccess = async (key?: string): Promise<boolean> => {
    const adminKey = key || prompt("Enter admin key:");
    if (!adminKey) return false;

    try {
      // User must be authenticated
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("You must be logged in to request admin access");
      }

      // Verify admin key and grant role
      const { data, error } = await supabase.functions.invoke("verify-admin", {
        body: { key: adminKey },
      });

      if (error) {
        console.error("Admin verification error:", error);
        return false;
      }

      if (!data?.valid) {
        return false;
      }

      // Refresh role status
      await refreshRole();
      return true;
    } catch (error) {
      console.error("Admin verification error:", error);
      return false;
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AdminContext.Provider
      value={{ isAdmin, isLoading, user, requestAdminAccess, logout, refreshRole }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdmin must be used within AdminProvider");
  }
  return context;
}
