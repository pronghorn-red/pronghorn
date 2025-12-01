import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { FileText, FilePlus, FileX, FilePenLine, Loader2, GitCommit, X } from "lucide-react";

interface StagedChange {
  id: string;
  operation_type: 'add' | 'edit' | 'delete' | 'rename';
  file_path: string;
  old_path?: string;
  created_at: string;
}

interface StagingPanelProps {
  projectId: string;
}

export function StagingPanel({ projectId }: StagingPanelProps) {
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("token");
  const { toast } = useToast();

  const [stagedChanges, setStagedChanges] = useState<StagedChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [repoId, setRepoId] = useState<string | null>(null);

  useEffect(() => {
    loadRepoAndStagedChanges();
  }, [projectId, shareToken]);

  const loadRepoAndStagedChanges = async () => {
    if (!projectId) return;

    try {
      setLoading(true);

      // Get default repo for this project
      const { data: repos, error: repoError } = await supabase.rpc("get_project_repos_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (repoError) throw repoError;

      const defaultRepo = repos?.find((r) => r.is_default) || repos?.[0];
      if (!defaultRepo) {
        setStagedChanges([]);
        setLoading(false);
        return;
      }

      setRepoId(defaultRepo.id);

      // Load staged changes
      const { data: staged, error: stagedError } = await supabase.rpc("get_staged_changes_with_token", {
        p_repo_id: defaultRepo.id,
        p_token: shareToken || null,
      });

      if (stagedError) throw stagedError;

      setStagedChanges((staged || []) as StagedChange[]);
    } catch (error: any) {
      console.error("Error loading staged changes:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load staged changes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!repoId || !commitMessage.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a commit message",
        variant: "destructive",
      });
      return;
    }

    try {
      setCommitting(true);

      const { data, error } = await supabase.rpc("commit_staged_with_token", {
        p_repo_id: repoId,
        p_token: shareToken || null,
        p_commit_message: commitMessage,
        p_branch: "main",
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Committed ${stagedChanges.length} changes`,
      });

      setCommitMessage("");
      loadRepoAndStagedChanges();
    } catch (error: any) {
      console.error("Error committing changes:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to commit changes",
        variant: "destructive",
      });
    } finally {
      setCommitting(false);
    }
  };

  const handleDiscardAll = async () => {
    if (!repoId) return;

    try {
      const { error } = await supabase.rpc("discard_staged_with_token", {
        p_repo_id: repoId,
        p_token: shareToken || null,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Discarded all staged changes",
      });

      loadRepoAndStagedChanges();
    } catch (error: any) {
      console.error("Error discarding changes:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to discard changes",
        variant: "destructive",
      });
    }
  };

  const getOperationIcon = (type: string) => {
    switch (type) {
      case "add":
        return <FilePlus className="w-4 h-4 text-green-500" />;
      case "edit":
        return <FilePenLine className="w-4 h-4 text-blue-500" />;
      case "delete":
        return <FileX className="w-4 h-4 text-red-500" />;
      case "rename":
        return <FileText className="w-4 h-4 text-yellow-500" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getOperationBadge = (type: string) => {
    const variants: Record<string, any> = {
      add: "default",
      edit: "secondary",
      delete: "destructive",
      rename: "outline",
    };
    return (
      <Badge variant={variants[type] || "default"} className="ml-2">
        {type}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Staged Changes</CardTitle>
          <CardDescription>
            Review uncommitted changes before committing to the repository
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stagedChanges.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <GitCommit className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No staged changes</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {stagedChanges.length} file{stagedChanges.length !== 1 ? "s" : ""} changed
                </p>
                <Button variant="ghost" size="sm" onClick={handleDiscardAll}>
                  <X className="w-4 h-4 mr-2" />
                  Discard All
                </Button>
              </div>

              <div className="space-y-2">
                {stagedChanges.map((change) => (
                  <div
                    key={change.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    {getOperationIcon(change.operation_type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{change.file_path}</p>
                      {change.operation_type === "rename" && change.old_path && (
                        <p className="text-xs text-muted-foreground truncate">
                          from: {change.old_path}
                        </p>
                      )}
                    </div>
                    {getOperationBadge(change.operation_type)}
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="commit-message">Commit Message</Label>
                  <Input
                    id="commit-message"
                    placeholder="Enter commit message..."
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    disabled={committing}
                  />
                </div>

                <Button
                  onClick={handleCommit}
                  disabled={committing || !commitMessage.trim()}
                  className="w-full"
                >
                  {committing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Committing...
                    </>
                  ) : (
                    <>
                      <GitCommit className="w-4 h-4 mr-2" />
                      Commit Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
