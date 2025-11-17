import { createContext, useContext, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AdminContextType {
  isAdmin: boolean;
  requestAdminAccess: () => Promise<boolean>;
  logout: () => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);

  const requestAdminAccess = async (): Promise<boolean> => {
    const key = prompt("Enter admin key:");
    if (!key) return false;

    // Verify against the backend
    try {
      const { data, error } = await supabase.functions.invoke("verify-admin", {
        body: { key },
      });

      if (error || !data?.valid) {
        alert("Invalid admin key");
        return false;
      }

      setIsAdmin(true);
      sessionStorage.setItem("admin_access", "true");
      return true;
    } catch (error) {
      alert("Invalid admin key");
      return false;
    }
  };

  const logout = () => {
    setIsAdmin(false);
    sessionStorage.removeItem("admin_access");
  };

  // Check session storage on mount
  useState(() => {
    const hasAccess = sessionStorage.getItem("admin_access") === "true";
    if (hasAccess) {
      setIsAdmin(true);
    }
  });

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
