import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface AdminContextType {
  isAdmin: boolean;
  adminToken: string | null;
  requestAdminAccess: (key?: string) => Promise<boolean>;
  logout: () => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

// Encrypt/decrypt admin token in localStorage (basic obfuscation)
const STORAGE_KEY = "_embly_admin_token";

function encodeToken(token: string): string {
  return btoa(token);
}

function decodeToken(encoded: string): string | null {
  try {
    return atob(encoded);
  } catch {
    return null;
  }
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);

  // Load token on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const decoded = decodeToken(stored);
      if (decoded) {
        setAdminToken(decoded);
        setIsAdmin(true);
      }
    }
  }, []);

  const requestAdminAccess = async (key?: string): Promise<boolean> => {
    const adminKey = key || prompt("Enter admin key:");
    if (!adminKey) return false;

    // Store the key - it will be validated on every admin operation
    const encoded = encodeToken(adminKey);
    localStorage.setItem(STORAGE_KEY, encoded);
    setAdminToken(adminKey);
    setIsAdmin(true);
    return true;
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAdminToken(null);
    setIsAdmin(false);
  };

  return (
    <AdminContext.Provider value={{ isAdmin, adminToken, requestAdminAccess, logout }}>
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
