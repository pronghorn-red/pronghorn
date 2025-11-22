import { useAuth } from "@/contexts/AuthContext";
import { useSearchParams } from "react-router-dom";

/**
 * Hook to construct project URLs with share token when needed
 * Authenticated users don't need tokens in URLs
 * Anonymous users need the token parameter to access projects
 */
export function useProjectUrl(projectId?: string) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const buildUrl = (path: string) => {
    if (!projectId) return path;
    
    const baseUrl = `/project/${projectId}${path}`;
    
    // Always preserve token if present in URL (for both authenticated and anonymous)
    if (token) return `${baseUrl}?token=${token}`;
    
    return baseUrl;
  };

  const getTokenParam = () => {
    if (user) return "";
    return token ? `?token=${token}` : "";
  };

  return { buildUrl, token, getTokenParam };
}
