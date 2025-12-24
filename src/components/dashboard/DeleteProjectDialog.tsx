import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Trash2, Loader2, AlertTriangle, Github, Cloud, Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DeleteProjectDialogProps {
  projectId: string;
  projectName: string;
  shareToken?: string | null;
  onDelete?: () => void;
}

interface DeletionCounts {
  github_repos: number;
  cloud_deployments: number;
  cloud_databases: number;
  external_connections: number;
  total_artifacts: number;
  total_requirements: number;
  total_canvas_nodes: number;
  total_chat_sessions: number;
}

export function DeleteProjectDialog({
  projectId,
  projectName,
  shareToken,
  onDelete
}: DeleteProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);
  const [counts, setCounts] = useState<DeletionCounts | null>(null);

  // Deletion options
  const [deleteGitHubRepos, setDeleteGitHubRepos] = useState(false);
  const [deleteDeployments, setDeleteDeployments] = useState(false);
  const [deleteDatabases, setDeleteDatabases] = useState(false);

  // Confirmation text inputs
  const [githubConfirmText, setGithubConfirmText] = useState("");
  const [deploymentsConfirmText, setDeploymentsConfirmText] = useState("");
  const [databasesConfirmText, setDatabasesConfirmText] = useState("");

  // Load deletion counts when dialog opens
  useEffect(() => {
    if (open && !counts && !isLoadingCounts) {
      loadDeletionCounts();
    }
  }, [open]);

  const loadDeletionCounts = async () => {
    setIsLoadingCounts(true);
    try {
      const { data, error } = await supabase.rpc('get_project_deletion_counts', {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (error) throw error;
      
      // Handle array response from RPC
      const countsData = Array.isArray(data) ? data[0] : data;
      setCounts(countsData);
    } catch (error) {
      console.error("Error loading deletion counts:", error);
      // Set empty counts on error
      setCounts({
        github_repos: 0,
        cloud_deployments: 0,
        cloud_databases: 0,
        external_connections: 0,
        total_artifacts: 0,
        total_requirements: 0,
        total_canvas_nodes: 0,
        total_chat_sessions: 0,
      });
    } finally {
      setIsLoadingCounts(false);
    }
  };

  // Validate confirmation texts
  const isGithubConfirmValid = !deleteGitHubRepos || githubConfirmText === "delete repos";
  const isDeploymentsConfirmValid = !deleteDeployments || deploymentsConfirmText === "delete deployments";
  const isDatabasesConfirmValid = !deleteDatabases || databasesConfirmText === "delete databases";
  const allConfirmationsValid = isGithubConfirmValid && isDeploymentsConfirmValid && isDatabasesConfirmValid;

  const handleDelete = async () => {
    if (!allConfirmationsValid) {
      toast.error("Please complete all confirmation fields");
      return;
    }

    setIsDeleting(true);

    try {
      // Call the delete-project edge function
      const { data, error } = await supabase.functions.invoke('delete-project', {
        body: {
          projectId,
          shareToken: shareToken || null,
          deleteGitHubRepos,
          deleteDeployments,
          deleteDatabases,
        },
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || "Failed to delete project");
      }

      // Show results summary
      const results = data.results || [];
      const githubResult = results.find((r: any) => r.category === 'github_repos');
      const deploymentsResult = results.find((r: any) => r.category === 'deployments');
      const databasesResult = results.find((r: any) => r.category === 'databases');

      let summary = "Project deleted successfully!";
      const warnings: string[] = [];

      if (githubResult?.count) {
        summary += ` ${githubResult.count} GitHub repos deleted.`;
      }
      if (deploymentsResult?.count) {
        summary += ` ${deploymentsResult.count} deployments removed.`;
      }
      if (databasesResult?.count) {
        summary += ` ${databasesResult.count} databases removed.`;
      }

      if (githubResult?.error) warnings.push(githubResult.error);
      if (deploymentsResult?.error) warnings.push(deploymentsResult.error);
      if (databasesResult?.error) warnings.push(databasesResult.error);

      toast.success(summary);
      if (warnings.length > 0) {
        toast.warning("Some external resources may not have been deleted: " + warnings.join("; "));
      }

      setOpen(false);
      onDelete?.();
    } catch (error) {
      console.error("Error deleting project:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete project");
    } finally {
      setIsDeleting(false);
    }
  };

  const resetState = () => {
    setDeleteGitHubRepos(false);
    setDeleteDeployments(false);
    setDeleteDatabases(false);
    setGithubConfirmText("");
    setDeploymentsConfirmText("");
    setDatabasesConfirmText("");
    setCounts(null);
  };

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetState();
    }}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon" className="h-8 w-8">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Delete project</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <AlertDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Project?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong>{projectName}</strong>? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isLoadingCounts ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading project data...
          </div>
        ) : counts && (
          <div className="space-y-4">
            {/* Project data summary */}
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="font-medium mb-2">The following will be permanently deleted:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                {counts.total_requirements > 0 && <li>{counts.total_requirements} requirements</li>}
                {counts.total_canvas_nodes > 0 && <li>{counts.total_canvas_nodes} canvas nodes</li>}
                {counts.total_artifacts > 0 && <li>{counts.total_artifacts} artifacts</li>}
                {counts.total_chat_sessions > 0 && <li>{counts.total_chat_sessions} chat sessions</li>}
                {counts.external_connections > 0 && <li>{counts.external_connections} database connections</li>}
                <li>All project settings and tokens</li>
              </ul>
            </div>

            {/* External resources options */}
            {(counts.github_repos > 0 || counts.cloud_deployments > 0 || counts.cloud_databases > 0) && (
              <>
                <Separator />
                <div className="space-y-4">
                  <p className="text-sm font-medium text-destructive">External Resources (Destructive)</p>
                  <p className="text-xs text-muted-foreground">
                    Optionally delete external resources. Each requires a separate confirmation.
                  </p>

                  {/* GitHub repos option */}
                  {counts.github_repos > 0 && (
                    <div className="space-y-2 border rounded-lg p-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="delete-github"
                          checked={deleteGitHubRepos}
                          onCheckedChange={(checked) => {
                            setDeleteGitHubRepos(!!checked);
                            if (!checked) setGithubConfirmText("");
                          }}
                        />
                        <Label htmlFor="delete-github" className="flex items-center gap-2 cursor-pointer">
                          <Github className="h-4 w-4" />
                          Delete {counts.github_repos} GitHub {counts.github_repos === 1 ? 'repository' : 'repositories'}
                        </Label>
                      </div>
                      {deleteGitHubRepos && (
                        <div className="ml-6 space-y-2">
                          <p className="text-xs text-destructive">
                            This will permanently delete repositories from GitHub!
                          </p>
                          <div className="space-y-1">
                            <Label htmlFor="github-confirm" className="text-xs text-muted-foreground">
                              Type <span className="font-mono font-bold">delete repos</span> to confirm:
                            </Label>
                            <Input
                              id="github-confirm"
                              value={githubConfirmText}
                              onChange={(e) => setGithubConfirmText(e.target.value)}
                              placeholder="delete repos"
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cloud deployments option */}
                  {counts.cloud_deployments > 0 && (
                    <div className="space-y-2 border rounded-lg p-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="delete-deployments"
                          checked={deleteDeployments}
                          onCheckedChange={(checked) => {
                            setDeleteDeployments(!!checked);
                            if (!checked) setDeploymentsConfirmText("");
                          }}
                        />
                        <Label htmlFor="delete-deployments" className="flex items-center gap-2 cursor-pointer">
                          <Cloud className="h-4 w-4" />
                          Terminate {counts.cloud_deployments} cloud {counts.cloud_deployments === 1 ? 'deployment' : 'deployments'}
                        </Label>
                      </div>
                      {deleteDeployments && (
                        <div className="ml-6 space-y-2">
                          <p className="text-xs text-destructive">
                            This will permanently remove deployments from Render!
                          </p>
                          <div className="space-y-1">
                            <Label htmlFor="deployments-confirm" className="text-xs text-muted-foreground">
                              Type <span className="font-mono font-bold">delete deployments</span> to confirm:
                            </Label>
                            <Input
                              id="deployments-confirm"
                              value={deploymentsConfirmText}
                              onChange={(e) => setDeploymentsConfirmText(e.target.value)}
                              placeholder="delete deployments"
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cloud databases option */}
                  {counts.cloud_databases > 0 && (
                    <div className="space-y-2 border rounded-lg p-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="delete-databases"
                          checked={deleteDatabases}
                          onCheckedChange={(checked) => {
                            setDeleteDatabases(!!checked);
                            if (!checked) setDatabasesConfirmText("");
                          }}
                        />
                        <Label htmlFor="delete-databases" className="flex items-center gap-2 cursor-pointer">
                          <Database className="h-4 w-4" />
                          Destroy {counts.cloud_databases} cloud {counts.cloud_databases === 1 ? 'database' : 'databases'}
                        </Label>
                      </div>
                      {deleteDatabases && (
                        <div className="ml-6 space-y-2">
                          <p className="text-xs text-destructive">
                            This will permanently destroy databases on Render! All data will be lost!
                          </p>
                          <div className="space-y-1">
                            <Label htmlFor="databases-confirm" className="text-xs text-muted-foreground">
                              Type <span className="font-mono font-bold">delete databases</span> to confirm:
                            </Label>
                            <Input
                              id="databases-confirm"
                              value={databasesConfirmText}
                              onChange={(e) => setDatabasesConfirmText(e.target.value)}
                              placeholder="delete databases"
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel disabled={isDeleting} onClick={resetState}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting || isLoadingCounts || !allConfirmationsValid}
          >
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete Project
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
