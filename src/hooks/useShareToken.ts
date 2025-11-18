import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export function useShareToken(projectId?: string) {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    
    if (token && projectId) {
      // Set the share token in the Postgres session
      const setToken = async () => {
        const { error } = await supabase.rpc("set_share_token", { token });
        if (error) {
          console.error("Failed to set share token:", error);
        }
      };
      setToken();
    }
  }, [searchParams, projectId]);

  return searchParams.get("token");
}
