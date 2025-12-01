import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { FileText, FilePlus, FileX, FilePenLine, Loader2, GitCommit, X, ArrowLeft, Upload } from "lucide-react";
import { CodeEditor } from "@/components/repository/CodeEditor";

interface StagedChange {
  id: string;
  operation_type: 'add' | 'edit' | 'delete' | 'rename';
  file_path: string;
  old_path?: string;
  old_content?: string;
  new_content?: string;
  created_at: string;
}

interface StagingPanelProps {
  projectId: string;
  onViewDiff?: (change: any) => void;
}

export function StagingPanel({ projectId, onViewDiff }: StagingPanelProps) {
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("token");
  const { toast } = useToast();

  const [stagedChanges, setStagedChanges] = useState<StagedChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [repoId, setRepoId] = useState<string | null>(null);
  const [repoInfo, setRepoInfo] = useState<any>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [viewingDiff, setViewingDiff] = useState<StagedChange | null>(null);

  useEffect(() => {
    loadRepoAndStagedChanges();
  }, [projectId, shareToken]);

  // Real-time subscription for staged changes
  useEffect(() => {
    if (!repoId) return;

    const channel = supabase
      .channel(`repo-staging-${repoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "repo_staging",
          filter: `repo_id=eq.${repoId}`,
        },
        () => {
          // Reload staged changes without showing a loading spinner to avoid flicker
          loadRepoAndStagedChanges(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [repoId]);

  const loadRepoAndStagedChanges = async (withLoading: boolean = true) => {
    if (!projectId) return;

    try {
      if (withLoading) {
        setLoading(true);
      }

      // Get default repo for this project
      const { data: repos, error: repoError } = await supabase.rpc("get_project_repos_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (repoError) throw repoError;

      const defaultRepo = repos?.find((r) => r.is_default) || repos?.[0];
      if (!defaultRepo) {
        setStagedChanges([]);
        setRepoInfo(null);
        if (withLoading) {
          setLoading(false);
        }
        return;
      }

      setRepoId(defaultRepo.id);
      setRepoInfo(defaultRepo);

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
      if (withLoading) {
        setLoading(false);
      }
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

  const handlePushToGitHub = async () => {
    if (!repoId || !repoInfo || !projectId) {
      toast({
        title: "Error",
        description: "No repository configured",
        variant: "destructive",
      });
      return;
    }

    try {
      setPushing(true);

      const { data, error } = await supabase.functions.invoke('sync-repo-push', {
        body: {
          repoId: repoId,
          projectId: projectId,
          shareToken: shareToken,
          branch: repoInfo.branch,
          commitMessage: "Push from Build staging",
          forcePush: false,
        },
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Pushed to ${repoInfo.organization}/${repoInfo.repo}`,
      });

      // Refresh to show any new sync state
      loadRepoAndStagedChanges(false);
    } catch (error: any) {
      console.error("Error pushing to GitHub:", error);
      toast({
        title: "Push Failed",
        description: error.message || "Failed to push to GitHub",
        variant: "destructive",
      });
    } finally {
      setPushing(false);
    }
  };

  const handleUnstageFile = async (filePath: string) => {
    if (!repoId) return;

    try {
      const { error } = await supabase.rpc("unstage_file_with_token", {
        p_repo_id: repoId,
        p_file_path: filePath,
        p_token: shareToken || null,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "File unstaged",
      });
      loadRepoAndStagedChanges();
    } catch (error: any) {
      console.error("Error unstaging file:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to unstage file",
        variant: "destructive",
      });
    }
  };

  const handleUnstageSelected = async () => {
    if (!repoId || selectedFiles.size === 0) return;

    try {
      const { error } = await supabase.rpc("unstage_files_with_token", {
        p_repo_id: repoId,
        p_file_paths: Array.from(selectedFiles),
        p_token: shareToken || null,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `${selectedFiles.size} file(s) unstaged`,
      });
      setSelectedFiles(new Set());
      loadRepoAndStagedChanges();
    } catch (error: any) {
      console.error("Error unstaging files:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to unstage files",
        variant: "destructive",
      });
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

  // Show diff viewer if a diff is being viewed
  if (viewingDiff) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setViewingDiff(null)}
          className="self-start shrink-0 mb-2"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Staging
        </Button>
        <div className="flex-1 min-h-0 overflow-hidden">
          <CodeEditor
            key={`${viewingDiff.id}-${viewingDiff.file_path}`}
            fileId={viewingDiff.id}
            filePath={viewingDiff.file_path}
            repoId={repoId || ""}
            isStaged={true}
            initialContent={viewingDiff.new_content || ""}
            showDiff={true}
            diffOldContent={viewingDiff.old_content || ""}
            onClose={() => setViewingDiff(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="shrink-0">
          <CardTitle>Staged Changes</CardTitle>
          <CardDescription>
            Review uncommitted changes before committing to the repository
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          {stagedChanges.length === 0 ? (
            <div className="space-y-6 py-6">
              <div className="text-center text-muted-foreground">
                <GitCommit className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="mb-2">No staged changes</p>
                {repoInfo && (
                  <p className="text-sm">Ready to push commits to GitHub</p>
                )}
              </div>
              {repoInfo && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <Button
                      onClick={handlePushToGitHub}
                      disabled={pushing}
                      className="w-full"
                      variant="default"
                    >
                      {pushing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Pushing...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Push to Repository
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">
                      {repoInfo.organization}/{repoInfo.repo} ({repoInfo.branch})
                    </p>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {stagedChanges.length} file{stagedChanges.length !== 1 ? "s" : ""} changed
                </p>
                <div className="flex items-center gap-2">
                  {selectedFiles.size > 0 && (
                    <Button variant="outline" size="sm" onClick={handleUnstageSelected}>
                      <X className="w-4 h-4 mr-2" />
                      Unstage Selected ({selectedFiles.size})
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={handleDiscardAll}>
                    <X className="w-4 h-4 mr-2" />
                    Discard All
                  </Button>
                </div>
              </div>

              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {stagedChanges.map((change) => (
                  <div
                    key={change.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedFiles.has(change.file_path)}
                      onCheckedChange={(checked) => {
                        const newSelected = new Set(selectedFiles);
                        if (checked) {
                          newSelected.add(change.file_path);
                        } else {
                          newSelected.delete(change.file_path);
                        }
                        setSelectedFiles(newSelected);
                      }}
                    />
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
                    <div className="flex items-center gap-1">
                      {(change.operation_type === 'edit' || change.operation_type === 'add') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewingDiff(change)}
                        >
                          Diff
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnstageFile(change.file_path)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
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
