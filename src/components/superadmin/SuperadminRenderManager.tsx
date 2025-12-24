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
  Pause, 
  Play, 
  RotateCcw, 
  Trash2,
  Server,
  Database,
  User,
  Calendar,
  Filter,
  ExternalLink,
  AlertTriangle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface RenderResource {
  id: string;
  name: string;
  slug?: string;
  type?: string;
  suspended?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  dashboardUrl?: string;
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

interface SuperadminRenderManagerProps {
  type: "services" | "databases";
}

export function SuperadminRenderManager({ type }: SuperadminRenderManagerProps) {
  const { toast } = useToast();
  const [resources, setResources] = useState<RenderResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showOrphansOnly, setShowOrphansOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; resource: RenderResource | null; isBulk: boolean }>({
    open: false,
    resource: null,
    isBulk: false,
  });

  const fetchResources = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Authentication required", variant: "destructive" });
        return;
      }

      const { data, error } = await supabase.functions.invoke("superadmin-render-management", {
        body: { action: type === "services" ? "listServices" : "listDatabases" },
      });

      if (error) throw error;

      const items = type === "services" ? data.services : data.databases;
      setResources(items || []);
    } catch (error: any) {
      console.error("Error fetching resources:", error);
      toast({
        title: "Error fetching resources",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, [type]);

  const handleAction = async (
    action: "suspend" | "resume" | "restart" | "delete",
    resource: RenderResource
  ) => {
    if (action === "delete") {
      setDeleteConfirm({ open: true, resource, isBulk: false });
      return;
    }

    setActionLoading(resource.id);
    try {
      const actionMap = {
        suspend: type === "services" ? "suspendService" : "suspendDatabase",
        resume: type === "services" ? "resumeService" : "resumeDatabase",
        restart: type === "services" ? "restartService" : "restartDatabase",
      };

      const body: any = { action: actionMap[action] };
      if (type === "services") {
        body.serviceId = resource.id;
      } else {
        body.postgresId = resource.id;
      }

      const { error } = await supabase.functions.invoke("superadmin-render-management", { body });
      if (error) throw error;

      toast({ title: `${action.charAt(0).toUpperCase() + action.slice(1)} successful` });
      fetchResources();
    } catch (error: any) {
      toast({
        title: `${action} failed`,
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const confirmDelete = async () => {
    const { resource, isBulk } = deleteConfirm;
    setDeleteConfirm({ open: false, resource: null, isBulk: false });

    if (isBulk) {
      // Bulk delete
      for (const id of selectedIds) {
        const res = resources.find((r) => r.id === id);
        if (res) {
          await performDelete(res);
        }
      }
      setSelectedIds(new Set());
    } else if (resource) {
      await performDelete(resource);
    }

    fetchResources();
  };

  const performDelete = async (resource: RenderResource) => {
    try {
      const body: any = {
        action: type === "services" ? "deleteService" : "deleteDatabase",
      };
      if (type === "services") {
        body.serviceId = resource.id;
      } else {
        body.postgresId = resource.id;
      }

      const { error } = await supabase.functions.invoke("superadmin-render-management", { body });
      if (error) throw error;

      toast({ title: `Deleted ${resource.name}` });
    } catch (error: any) {
      toast({
        title: `Delete failed: ${resource.name}`,
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredResources.map((r) => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const selectOrphans = () => {
    const orphanIds = resources.filter((r) => r.isOrphaned).map((r) => r.id);
    setSelectedIds(new Set(orphanIds));
  };

  const filteredResources = resources.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.ownerInfo?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.projectInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOrphan = !showOrphansOnly || r.isOrphaned;
    return matchesSearch && matchesOrphan;
  });

  const getStatusBadge = (resource: RenderResource) => {
    const status = resource.suspended === "suspended" ? "suspended" : resource.status || "unknown";
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      suspended: "secondary",
      running: "default",
      available: "default",
      deploying: "outline",
      unknown: "outline",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

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
          {type === "services" ? (
            <Server className="h-5 w-5 text-primary" />
          ) : (
            <Database className="h-5 w-5 text-primary" />
          )}
          All Render {type === "services" ? "Services" : "Databases"}
          <Badge variant="outline" className="ml-2">
            {resources.length}
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Manage all {type} across all projects. Orphaned resources have no linked project.
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
                  setDeleteConfirm({ open: true, resource: null, isBulk: true })
                }
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Selected ({selectedIds.size})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={fetchResources} disabled={loading}>
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
                      filteredResources.length > 0 &&
                      filteredResources.every((r) => selectedIds.has(r.id))
                    }
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Resource Age</TableHead>
                <TableHead>Project Age</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredResources.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No {type} found
                  </TableCell>
                </TableRow>
              ) : (
                filteredResources.map((resource) => (
                  <TableRow
                    key={resource.id}
                    className={resource.isOrphaned ? "bg-destructive/5" : ""}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(resource.id)}
                        onCheckedChange={(checked) =>
                          handleSelectOne(resource.id, checked as boolean)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{resource.name}</span>
                        {resource.isOrphaned && (
                          <Badge variant="destructive" className="text-xs">
                            Orphaned
                          </Badge>
                        )}
                        {resource.dashboardUrl && (
                          <a
                            href={resource.dashboardUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{resource.id}</div>
                    </TableCell>
                    <TableCell>{getStatusBadge(resource)}</TableCell>
                    <TableCell>
                      {resource.ownerInfo ? (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">
                            {resource.ownerInfo.display_name || resource.ownerInfo.email}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {resource.projectInfo ? (
                        <span className="text-sm">{resource.projectInfo.name}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {getDaysOld(resource.resourceCreatedAt || resource.createdAt) || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {resource.projectInfo
                          ? getDaysOld(resource.projectInfo.created_at)
                          : "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleAction("suspend", resource)}
                          disabled={actionLoading === resource.id}
                          title="Suspend"
                        >
                          <Pause className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleAction("resume", resource)}
                          disabled={actionLoading === resource.id}
                          title="Resume"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleAction("restart", resource)}
                          disabled={actionLoading === resource.id}
                          title="Restart"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleAction("delete", resource)}
                          disabled={actionLoading === resource.id}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
            setDeleteConfirm({ open, resource: null, isBulk: false })
          }
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteConfirm.isBulk
                  ? `This will permanently delete ${selectedIds.size} selected ${type}. This action cannot be undone.`
                  : `This will permanently delete "${deleteConfirm.resource?.name}". This action cannot be undone.`}
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
