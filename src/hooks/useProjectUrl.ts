import { useAuth } from "@/contexts/AuthContext";
import { getProjectToken } from "@/lib/tokenCache";
import type { To } from "react-router-dom";

/**
 * Hook to construct project URLs with share token when needed
 * Uses path-based token pattern: /project/{projectId}/page/t/{token}
 * 
 * For internal navigation, uses /t/masked to hide the real token
 * For external sharing, uses the real token from storage
 * 
 * Returns React Router's To type (object with pathname) for clean navigation
 */
export function useProjectUrl(projectId?: string) {
  const { user } = useAuth();
  // Get token from cache (not URL - URL may be masked)
  const token = projectId ? getProjectToken(projectId) : null;

  /**
   * Build a URL for internal project navigation
   * Uses /t/masked to hide the real token in the URL bar
   */
  const buildUrl = (path: string): To => {
    if (!projectId) return { pathname: path };
    
    // Base path without trailing slash
    const basePath = `/project/${projectId}${path}`;
    
    // Use masked placeholder for internal navigation (token stored in sessionStorage)
    if (token) {
      return { pathname: `${basePath}/t/masked` };
    }
    
    return { pathname: basePath };
  };

  /**
   * Get full URL string for external sharing (with domain and REAL token)
   * This is the URL users should copy to share with others
   */
  const getShareUrl = (path: string, domain: string = "https://pronghorn.red"): string => {
    if (!projectId) return `${domain}${path}`;
    
    const basePath = `/project/${projectId}${path}`;
    
    // Use REAL token for sharing URLs (so recipients can access)
    if (token) {
      return `${domain}${basePath}/t/${token}`;
    }
    
    return `${domain}${basePath}`;
  };

  /**
   * Get the token path segment for manual URL construction
   * Uses masked for internal, returns empty for authenticated users without tokens
   */
  const getTokenParam = () => {
    if (user && !token) return "";
    return token ? "/t/masked" : "";
  };

  return { buildUrl, getShareUrl, token, getTokenParam };
}
