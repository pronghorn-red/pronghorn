import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  RefreshCw, 
  Trash2,
  GitBranch,
  User,
  Calendar,
  Filter,
  ExternalLink,
  AlertTriangle,
  Lock,
  Unlock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  visibility: "public" | "private";
  html_url: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  default_branch: string;
  size: number;
  ownerInfo?: {
    email: string;
    display_name?: string;
  } | null;
  projectInfo?: {
    id: string;
    name: string;
    created_at: string;
  } | null;
  resourceCreatedAt?: string;
  isOrphaned: boolean;
}

export function SuperadminGitHubManager() {
  const { toast } = useToast();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showOrphansOnly, setShowOrphansOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; repo: GitHubRepo | null; isBulk: boolean }>({
    open: false,
    repo: null,
    isBulk: false,
  });

  const fetchRepos = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Authentication required", variant: "destructive" });
        return;
      }

      const { data, error } = await supabase.functions.invoke("superadmin-github-management", {
        body: { action: "listRepos" },
      });

      if (error) throw error;

      setRepos(data.repos || []);
    } catch (error: any) {
      console.error("Error fetching repos:", error);
      toast({
        title: "Error fetching repositories",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepos();
  }, []);

  const handleDelete = (repo: GitHubRepo) => {
    setDeleteConfirm({ open: true, repo, isBulk: false });
  };

  const confirmDelete = async () => {
    const { repo, isBulk } = deleteConfirm;
    setDeleteConfirm({ open: false, repo: null, isBulk: false });

    if (isBulk) {
      for (const id of selectedIds) {
        const r = repos.find((r) => r.id === id);
        if (r) {
          await performDelete(r);
        }
      }
      setSelectedIds(new Set());
    } else if (repo) {
      await performDelete(repo);
    }

    fetchRepos();
  };

  const performDelete = async (repo: GitHubRepo) => {
    try {
      const { error } = await supabase.functions.invoke("superadmin-github-management", {
        body: { action: "deleteRepo", owner: repo.owner, repo: repo.name },
      });

      if (error) throw error;

      toast({ title: `Deleted ${repo.full_name}` });
    } catch (error: any) {
      toast({
        title: `Delete failed: ${repo.full_name}`,
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredRepos.map((r) => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const selectOrphans = () => {
    const orphanIds = repos.filter((r) => r.isOrphaned).map((r) => r.id);
    setSelectedIds(new Set(orphanIds));
  };

  const filteredRepos = repos.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.ownerInfo?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.projectInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOrphan = !showOrphansOnly || r.isOrphaned;
    return matchesSearch && matchesOrphan;
  });

  const getDaysOld = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: false });
    } catch {
      return null;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <GitBranch className="h-5 w-5 text-primary" />
          All GitHub Repositories
          <Badge variant="outline" className="ml-2">
            {repos.length}
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Manage all repositories accessible via the system GitHub PAT. Orphaned repos have no linked project.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Toolbar */}
        <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Search by name, owner, project..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-64"
            />
            <Button
              variant={showOrphansOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowOrphansOnly(!showOrphansOnly)}
            >
              <Filter className="h-4 w-4 mr-1" />
              Orphans Only
            </Button>
            <Button variant="outline" size="sm" onClick={selectOrphans}>
              <AlertTriangle className="h-4 w-4 mr-1" />
              Select Orphans
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  setDeleteConfirm({ open: true, repo: null, isBulk: true })
                }
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Selected ({selectedIds.size})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={fetchRepos} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="border rounded-md overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      filteredRepos.length > 0 &&
                      filteredRepos.every((r) => selectedIds.has(r.id))
                    }
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>Repository</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Repo Age</TableHead>
                <TableHead>Project Age</TableHead>
                <TableHead>Last Push</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredRepos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No repositories found
                  </TableCell>
                </TableRow>
              ) : (
                filteredRepos.map((repo) => (
                  <TableRow
                    key={repo.id}
                    className={repo.isOrphaned ? "bg-destructive/5" : ""}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(repo.id)}
                        onCheckedChange={(checked) =>
                          handleSelectOne(repo.id, checked as boolean)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{repo.full_name}</span>
                        {repo.isOrphaned && (
                          <Badge variant="destructive" className="text-xs">
                            Orphaned
                          </Badge>
                        )}
                        <a
                          href={repo.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {repo.default_branch} • {Math.round(repo.size / 1024)}MB
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={repo.visibility === "private" ? "secondary" : "outline"}>
                        {repo.visibility === "private" ? (
                          <Lock className="h-3 w-3 mr-1" />
                        ) : (
                          <Unlock className="h-3 w-3 mr-1" />
                        )}
                        {repo.visibility}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {repo.ownerInfo ? (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">
                            {repo.ownerInfo.display_name || repo.ownerInfo.email}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {repo.projectInfo ? (
                        <span className="text-sm">{repo.projectInfo.name}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {getDaysOld(repo.created_at) || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {repo.projectInfo
                          ? getDaysOld(repo.projectInfo.created_at)
                          : "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {getDaysOld(repo.pushed_at) || "—"} ago
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(repo)}
                        title="Delete Repository"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={deleteConfirm.open}
          onOpenChange={(open) =>
            setDeleteConfirm({ open, repo: null, isBulk: false })
          }
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteConfirm.isBulk
                  ? `This will permanently delete ${selectedIds.size} selected repositories from GitHub. This action cannot be undone.`
                  : `This will permanently delete "${deleteConfirm.repo?.full_name}" from GitHub. This action cannot be undone.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
