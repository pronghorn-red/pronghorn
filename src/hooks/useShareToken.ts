import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getProjectToken, setProjectToken } from "@/lib/tokenCache";

export function useShareToken(projectId?: string) {
  const navigate = useNavigate();
  const location = useLocation();
  // Extract token from path params (new pattern: /project/:projectId/page/t/:token)
  const params = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();
  
  // Get token synchronously - check cache first, then URL params
  const getTokenSync = (): string | null => {
    // Check cache first for instant access
    if (projectId) {
      const cachedToken = getProjectToken(projectId);
      if (cachedToken) return cachedToken;
    }
    
    // Fall back to URL params (skip if masked)
    const tokenFromPath = params.token;
    const tokenFromQuery = searchParams.get("token");
    const urlToken = tokenFromPath || tokenFromQuery;
    
    // Don't return 'masked' as a valid token
    if (urlToken && urlToken !== 'masked') {
      return urlToken;
    }
    
    return null;
  };
  
  // Initialize state synchronously with best available token
  const [token, setToken] = useState<string | null>(getTokenSync);
  const [isTokenSet, setIsTokenSet] = useState(() => {
    // If we have a cached token or no projectId, we're ready immediately
    const cachedToken = projectId ? getProjectToken(projectId) : null;
    return !!cachedToken || !projectId;
  });
  const [tokenMissing, setTokenMissing] = useState(false);

  useEffect(() => {
    // Priority: path param > query param (for backwards compatibility)
    const tokenFromPath = params.token;
    const tokenFromQuery = searchParams.get("token");
    const tokenParam = tokenFromPath || tokenFromQuery;
    
    // Case 1: Real token in URL (not 'masked') - store and mask
    if (tokenParam && tokenParam !== 'masked' && projectId) {
      // Cache the token for synchronous access on future renders/navigations
      setProjectToken(projectId, tokenParam);
      setToken(tokenParam);
      setTokenMissing(false);
      
      // Set the share token in the Postgres session
      const setTokenInDb = async () => {
        const { error } = await supabase.rpc("set_share_token", { token: tokenParam });
        if (error) {
          console.error("Failed to set share token:", error);
        } else {
          setIsTokenSet(true);
        }
        
        // MASK THE URL - replace real token with 'masked' for security
        const currentPath = location.pathname;
        const maskedPath = currentPath.replace(`/t/${tokenParam}`, '/t/masked');
        if (maskedPath !== currentPath) {
          navigate(maskedPath, { replace: true });
        }
      };
      setTokenInDb();
    }
    // Case 2: URL has /t/masked - retrieve from storage
    else if (tokenParam === 'masked' && projectId) {
      const storedToken = getProjectToken(projectId);
      if (storedToken) {
        setToken(storedToken);
        setTokenMissing(false);
        
        const setTokenInDb = async () => {
          const { error } = await supabase.rpc("set_share_token", { token: storedToken });
          if (error) {
            console.error("Failed to set share token:", error);
          } else {
            setIsTokenSet(true);
          }
        };
        setTokenInDb();
      } else {
        // No token in storage - show recovery message
        setTokenMissing(true);
        setIsTokenSet(false);
      }
    }
    // Case 3: No token needed (authenticated user or no token in URL)
    else if (!tokenParam) {
      setIsTokenSet(true);
      setTokenMissing(false);
    }
  }, [params.token, searchParams, projectId, navigate, location.pathname]);

  return { token, isTokenSet, tokenMissing };
}
