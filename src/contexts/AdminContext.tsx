import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AdminContextType {
  isAdmin: boolean;
  requestAdminAccess: (key?: string) => Promise<boolean>;
  logout: () => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);

  const requestAdminAccess = async (key?: string): Promise<boolean> => {
    const adminKey = key || prompt("Enter admin key:");
    if (!adminKey) return false;

    // Verify against the backend
    try {
      const { data, error } = await supabase.functions.invoke("verify-admin", {
        body: { key: adminKey },
      });

      if (error || !data?.valid) {
        return false;
      }

      setIsAdmin(true);
      sessionStorage.setItem("admin_access", "true");
      return true;
    } catch (error) {
      console.error("Admin verification error:", error);
      return false;
    }
  };

  const logout = () => {
    setIsAdmin(false);
    sessionStorage.removeItem("admin_access");
  };

  // Check session storage on mount
  useEffect(() => {
    const hasAccess = sessionStorage.getItem("admin_access") === "true";
    if (hasAccess) {
      setIsAdmin(true);
    }
  }, []);

  return (
    <AdminContext.Provider value={{ isAdmin, requestAdminAccess, logout }}>
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
