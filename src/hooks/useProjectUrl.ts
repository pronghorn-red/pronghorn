import { useAuth } from "@/contexts/AuthContext";
import { useSearchParams } from "react-router-dom";
import type { To } from "react-router-dom";

/**
 * Hook to construct project URLs with share token when needed
 * Authenticated users don't need tokens in URLs
 * Anonymous users need the token parameter to access projects
 * 
 * Returns React Router's To type (object with pathname/search) to prevent URL encoding issues
 */
export function useProjectUrl(projectId?: string) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  /**
   * Build a URL for project navigation
   * Returns an object with pathname and search to prevent ? encoding issues
   */
  const buildUrl = (path: string): To => {
    if (!projectId) return { pathname: path };
    
    const pathname = `/project/${projectId}${path}`;
    
    // Always preserve token if present in URL (for both authenticated and anonymous)
    // CRITICAL: Include ? prefix in search to prevent URL encoding issues
    if (token) {
      return { pathname, search: `?token=${token}` };
    }
    
    return { pathname };
  };

  const getTokenParam = () => {
    if (user) return "";
    return token ? `?token=${token}` : "";
  };

  return { buildUrl, token, getTokenParam };
}
