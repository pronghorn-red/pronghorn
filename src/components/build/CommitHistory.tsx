import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { GitBranch, GitCommit, Loader2, RotateCcw, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Commit {
  id: string;
  commit_sha: string;
  commit_message: string;
  branch: string;
  files_changed: number;
  files_metadata?: any;
  committed_at: string;
  committed_by?: string;
}

interface CommitHistoryProps {
  projectId: string;
}

export function CommitHistory({ projectId }: CommitHistoryProps) {
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("token");
  const { toast } = useToast();

  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [repoId, setRepoId] = useState<string | null>(null);
  const [repoInfo, setRepoInfo] = useState<any>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    loadCommitHistory();
  }, [projectId, shareToken]);

  const loadCommitHistory = async () => {
    if (!projectId) return;

    try {
      setLoading(true);

      // Get default repo (Prime or default)
      const { data: repos, error: repoError } = await supabase.rpc("get_project_repos_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (repoError) throw repoError;

      const defaultRepo = repos?.find((r: any) => r.is_prime) || repos?.find((r: any) => r.is_default) || repos?.[0];
      if (!defaultRepo) {
        setCommits([]);
        setLoading(false);
        return;
      }

      setRepoId(defaultRepo.id);
      setRepoInfo(defaultRepo);

      // Load commit history
      const { data, error } = await supabase.rpc("get_commit_history_with_token", {
        p_repo_id: defaultRepo.id,
        p_token: shareToken || null,
        p_limit: 50,
      });

      if (error) throw error;

      setCommits(data || []);
    } catch (error: any) {
      console.error("Error loading commit history:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load commit history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (commitId: string, commitSha: string) => {
    if (!repoId || !projectId || !repoInfo) return;

    try {
      setRestoring(commitId);

      // Step 1: Reset all repo files (clear staging and committed files)
      const { error: resetError } = await supabase.rpc("reset_repo_files_with_token", {
        p_repo_id: repoId,
        p_token: shareToken || null,
      });

      if (resetError) throw resetError;

      // Step 2: Pull fresh from GitHub at the target commit SHA
      const { data, error: pullError } = await supabase.functions.invoke("sync-repo-pull", {
        body: {
          repoId: repoId,
          projectId: projectId,
          shareToken: shareToken,
          commitSha: commitSha, // Pull at this specific commit
        },
      });

      if (pullError) throw pullError;

      toast({
        title: "Restore Complete",
        description: `Restored ${data?.filesCount || 'all'} files from commit ${commitSha.substring(0, 7)}`,
      });

      // Reload commit history
      loadCommitHistory();
    } catch (error: any) {
      console.error("Error restoring to commit:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to restore to commit",
        variant: "destructive",
      });
    } finally {
      setRestoring(null);
    }
  };

  if (loading) {
    return (
      <Card className="h-full flex flex-col overflow-hidden">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="shrink-0">
        <CardTitle>Commit History</CardTitle>
        <CardDescription>View and restore to previous commits</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        {commits.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <GitCommit className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No commits yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {commits.map((commit) => (
              <div
                key={commit.id}
                className="flex gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-shrink-0">
                  <GitCommit className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium">{commit.commit_message}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDistanceToNow(new Date(commit.committed_at), { addSuffix: true })}
                        </span>
                        <span className="flex items-center gap-1">
                          <GitBranch className="w-3 h-3" />
                          {commit.branch}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRestore(commit.id, commit.commit_sha)}
                      disabled={restoring === commit.id}
                    >
                      {restoring === commit.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Restore
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {commit.files_changed} file{commit.files_changed !== 1 ? "s" : ""}
                    </Badge>
                    <code className="text-xs text-muted-foreground font-mono">
                      {commit.commit_sha.substring(0, 7)}
                    </code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
