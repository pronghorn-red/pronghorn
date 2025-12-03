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
  autoCommit: boolean;
  onAutoCommitChange: (checked: boolean) => void;
}

export function StagingPanel({ projectId, onViewDiff, autoCommit, onAutoCommitChange }: StagingPanelProps) {
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
  const [allRepos, setAllRepos] = useState<any[]>([]); // Track all repos for multi-push
  const [pendingCommits, setPendingCommits] = useState<any[]>([]);
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

      // Store all repos for multi-push support
      setAllRepos(repos || []);

      // Use Prime repo for all operations (staging, commits, push)
      // Fall back to default repo if no prime exists
      const primaryRepo = repos?.find((r) => r.is_prime) || repos?.find((r) => r.is_default) || repos?.[0];
      if (!primaryRepo) {
        setStagedChanges([]);
        setRepoInfo(null);
        setPendingCommits([]);
        if (withLoading) {
          setLoading(false);
        }
        return;
      }

      setRepoId(primaryRepo.id);
      setRepoInfo(primaryRepo);

      // Load staged changes
      const { data: staged, error: stagedError } = await supabase.rpc("get_staged_changes_with_token", {
        p_repo_id: primaryRepo.id,
        p_token: shareToken || null,
      });

      if (stagedError) throw stagedError;

      setStagedChanges((staged || []) as StagedChange[]);

      // Load pending commits (commits not yet pushed to GitHub)
      const { data: commits, error: commitsError } = await supabase.rpc("get_commit_history_with_token", {
        p_repo_id: primaryRepo.id,
        p_token: shareToken || null,
        p_branch: primaryRepo.branch,
        p_limit: 10,
      });

      if (!commitsError && commits) {
        setPendingCommits(commits);
      }
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
    if (!projectId || allRepos.length === 0) {
      toast({
        title: "Error",
        description: "No repositories configured",
        variant: "destructive",
      });
      return;
    }

    if (pendingCommits.length === 0) {
      toast({
        title: "Error",
        description: "No pending commits to push",
        variant: "destructive",
      });
      return;
    }

    try {
      setPushing(true);

      // Find Prime repo (source of truth) and mirror repos
      const primeRepo = allRepos.find(r => r.is_prime) || allRepos[0];
      const mirrorRepos = allRepos.filter(r => r.id !== primeRepo.id);

      // Collect file paths from all pending commits, separating adds/edits from deletes
      const addEditPaths = new Set<string>();
      const deletePaths = new Set<string>();
      pendingCommits.forEach(commit => {
        if (commit.files_metadata && Array.isArray(commit.files_metadata)) {
          commit.files_metadata.forEach((file: any) => {
            if (file.path) {
              if (file.operation === 'delete') {
                deletePaths.add(file.path);
              } else if (file.operation === 'rename') {
                // For renames: add new path to push, add old path to delete
                addEditPaths.add(file.path);
                if (file.old_path) {
                  deletePaths.add(file.old_path);
                }
              } else {
                // 'add' or 'edit'
                addEditPaths.add(file.path);
              }
            }
          });
        }
      });

      // Use the most recent commit message (first in the list)
      const commitMessage = pendingCommits[0]?.commit_message || "Push from Build staging";

      // Step 1: Push to Prime repo first
      const { data: primeResult, error: primeError } = await supabase.functions.invoke('sync-repo-push', {
        body: {
          repoId: primeRepo.id,
          projectId: projectId,
          shareToken: shareToken,
          branch: primeRepo.branch,
          commitMessage: commitMessage,
          filePaths: addEditPaths.size > 0 ? Array.from(addEditPaths) : undefined,
          deletePaths: deletePaths.size > 0 ? Array.from(deletePaths) : undefined,
          forcePush: false,
        },
      });

      if (primeError) {
        toast({
          title: "Push Failed",
          description: `Failed to push to Prime repository: ${primeError.message}`,
          variant: "destructive",
        });
        return;
      }

      let successCount = 1; // Prime succeeded
      let failureCount = 0;
      const failedRepos: string[] = [];

      // Step 2: Force push Prime's files to all mirror repos
      if (mirrorRepos.length > 0) {
        const mirrorPromises = mirrorRepos.map(async (repo) => {
          const { data, error } = await supabase.functions.invoke('sync-repo-push', {
            body: {
              repoId: repo.id,
              sourceRepoId: primeRepo.id, // Fetch files from Prime repo
              projectId: projectId,
              shareToken: shareToken,
              branch: repo.branch,
              commitMessage: `Mirror sync: ${commitMessage}`,
              forcePush: true, // Force push to overwrite mirrors
            },
          });
          return { repo, data, error };
        });

        const mirrorResults = await Promise.allSettled(mirrorPromises);

        mirrorResults.forEach((result) => {
          if (result.status === 'fulfilled' && !result.value.error) {
            successCount++;
          } else {
            failureCount++;
            if (result.status === 'fulfilled') {
              failedRepos.push(`${result.value.repo.organization}/${result.value.repo.repo}`);
            }
          }
        });
      }

      if (failureCount === 0) {
        toast({
          title: "Success",
          description: allRepos.length === 1
            ? `Pushed to ${primeRepo.organization}/${primeRepo.repo}`
            : `Pushed to Prime + ${mirrorRepos.length} mirror(s)`,
        });
      } else {
        toast({
          title: "Partial Success",
          description: `Pushed to Prime, failed mirrors: ${failedRepos.join(', ')}`,
          variant: "destructive",
        });
      }

      // Refresh to clear pending commits and show new sync state
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
                {repoInfo && pendingCommits.length > 0 && (
                  <p className="text-sm">Ready to push {pendingCommits.length} commit{pendingCommits.length !== 1 ? 's' : ''} to GitHub</p>
                )}
                {repoInfo && pendingCommits.length === 0 && (
                  <p className="text-sm">All commits are up to date</p>
                )}
              </div>
              
              {repoInfo && pendingCommits.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">Pending Commits</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {pendingCommits.map((commit) => (
                        <div
                          key={commit.id}
                          className="p-3 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            <GitCommit className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{commit.commit_message}</p>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                <span className="font-mono">{commit.commit_sha.substring(0, 7)}</span>
                                <span>•</span>
                                <span>{commit.files_changed} file{commit.files_changed !== 1 ? 's' : ''}</span>
                                <span>•</span>
                                <span>{new Date(commit.committed_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              
              {repoInfo && pendingCommits.length > 0 && (
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
                      {(() => {
                        const primeRepo = allRepos.find(r => r.is_prime) || allRepos[0];
                        const mirrorCount = allRepos.length - 1;
                        if (mirrorCount === 0) {
                          return `${primeRepo?.organization}/${primeRepo?.repo} (Prime)`;
                        }
                        return `Prime: ${primeRepo?.organization}/${primeRepo?.repo} + ${mirrorCount} mirror(s)`;
                      })()}
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
                      {(change.operation_type === 'edit' || change.operation_type === 'add' || change.operation_type === 'delete') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewingDiff(change)}
                        >
                          {change.operation_type === 'delete' ? 'View' : 'Diff'}
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

                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="auto-commit-staging" 
                    checked={autoCommit}
                    onCheckedChange={(checked) => onAutoCommitChange(checked as boolean)}
                  />
                  <Label htmlFor="auto-commit-staging" className="text-sm">
                    Auto-commit and push changes
                  </Label>
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
