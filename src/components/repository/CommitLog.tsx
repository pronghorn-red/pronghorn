import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitCommit, Calendar, FileCode } from "lucide-react";
import { useSearchParams } from "react-router-dom";

interface Commit {
  id: string;
  branch: string;
  commit_sha: string;
  commit_message: string;
  files_changed: number;
  committed_at: string;
}

interface CommitLogProps {
  repoId: string;
  selectedBranch?: string;
}

export function CommitLog({ repoId, selectedBranch }: CommitLogProps) {
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("token");
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCommits();
  }, [repoId, selectedBranch]);

  const loadCommits = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_repo_commits_with_token", {
        p_repo_id: repoId,
        p_token: shareToken || null,
        p_branch: selectedBranch || null,
      });

      if (error) throw error;
      setCommits(data || []);
    } catch (error) {
      console.error("Error loading commits:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-[#1e1e1e] border-[#3e3e42]">
        <CardContent className="py-4 text-center text-[#cccccc]">
          Loading commits...
        </CardContent>
      </Card>
    );
  }

  if (commits.length === 0) {
    return (
      <Card className="bg-[#1e1e1e] border-[#3e3e42]">
        <CardContent className="py-4 text-center text-[#858585]">
          No commits yet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#1e1e1e] border-[#3e3e42]">
      <CardHeader>
        <CardTitle className="text-[#cccccc] text-sm flex items-center gap-2">
          <GitCommit className="h-4 w-4" />
          Commit History {selectedBranch && `(${selectedBranch})`}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-3">
            {commits.map((commit) => (
              <div
                key={commit.id}
                className="p-3 bg-[#252526] border border-[#3e3e42] rounded-lg hover:bg-[#2a2d2e] transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#cccccc] truncate">
                      {commit.commit_message}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-[#858585]">
                      <span className="flex items-center gap-1">
                        <GitCommit className="h-3 w-3" />
                        {commit.commit_sha.substring(0, 7)}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileCode className="h-3 w-3" />
                        {commit.files_changed} {commit.files_changed === 1 ? 'file' : 'files'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(commit.committed_at).toLocaleString()}
                      </span>
                    </div>
                    {commit.branch !== 'main' && (
                      <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-[#3e3e42] text-[#cccccc] rounded">
                        {commit.branch}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
