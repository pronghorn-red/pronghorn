import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";

interface ProjectRepo {
  id: string;
  project_id: string;
  organization: string;
  repo: string;
  branch: string;
  is_default: boolean;
  is_prime: boolean;
  created_at: string;
  updated_at: string;
}

export function useRealtimeRepos(projectId: string | undefined) {
  const [repos, setRepos] = useState<ProjectRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("token");

  const loadRepos = async () => {
    if (!projectId) return;

    try {
      const { data, error } = await supabase.rpc("get_project_repos_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (error) throw error;
      setRepos(data || []);
    } catch (error) {
      console.error("Error loading repos:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRepos();

    if (!projectId) return;

    const channel = supabase
      .channel(`project_repos-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_repos",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          loadRepos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, shareToken]);

  return { repos, loading, refetch: loadRepos };
}
