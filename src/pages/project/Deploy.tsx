import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Cloud, Laptop, Server, Plus, RefreshCw, Database } from "lucide-react";
import { useShareToken } from "@/hooks/useShareToken";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { ProjectPageHeader } from "@/components/layout/ProjectPageHeader";
import DeploymentCard from "@/components/deploy/DeploymentCard";
import DeploymentDialog from "@/components/deploy/DeploymentDialog";
import { DatabaseCard } from "@/components/deploy/DatabaseCard";
import { DatabaseDialog } from "@/components/deploy/DatabaseDialog";
import type { Database as DBTypes } from "@/integrations/supabase/types";

type Deployment = DBTypes["public"]["Tables"]["project_deployments"]["Row"];

const Deploy = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken, isTokenSet } = useShareToken(projectId);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [databases, setDatabases] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDatabasesLoading, setIsDatabasesLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateDatabaseOpen, setIsCreateDatabaseOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("cloud");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [primeRepoName, setPrimeRepoName] = useState("");

  // Fetch prime repo name for auto-generating deployment/database names
  const fetchPrimeRepoName = async () => {
    if (!projectId || !isTokenSet) return;
    
    try {
      const { data, error } = await supabase.rpc("get_project_repos_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });
      
      if (!error && data) {
        const primeRepo = data.find((r: any) => r.is_prime) || data[0];
        if (primeRepo) {
          setPrimeRepoName(primeRepo.repo);
        }
      }
    } catch (error) {
      console.error("Error fetching prime repo:", error);
    }
  };

  const fetchDeployments = async () => {
    if (!projectId || !isTokenSet) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_deployments_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });
      
      if (error) throw error;
      setDeployments((data as Deployment[]) || []);
    } catch (error: any) {
      console.error("Error fetching deployments:", error);
      toast.error("Failed to load deployments");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDatabases = async () => {
    if (!projectId || !isTokenSet) return;
    
    setIsDatabasesLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_databases_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });
      
      if (error) throw error;
      setDatabases(data || []);
    } catch (error: any) {
      console.error("Error fetching databases:", error);
      toast.error("Failed to load databases");
    } finally {
      setIsDatabasesLoading(false);
    }
  };

  useEffect(() => {
    fetchDeployments();
    fetchDatabases();
    fetchPrimeRepoName();
  }, [projectId, isTokenSet, shareToken]);

  const cloudDeployments = deployments.filter(d => d.platform === "pronghorn_cloud");
  const localDeployments = deployments.filter(d => d.platform === "local");

  const handleRefresh = () => {
    if (activeTab === "databases") {
      fetchDatabases();
    } else {
      fetchDeployments();
    }
  };

  const handleCreate = () => {
    if (activeTab === "databases") {
      setIsCreateDatabaseOpen(true);
    } else {
      setIsCreateOpen(true);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <ProjectSidebar 
        projectId={projectId || ""} 
        isOpen={isSidebarOpen} 
        onOpenChange={setIsSidebarOpen} 
      />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <ProjectPageHeader
            title="Deploy"
            onMenuClick={() => setIsSidebarOpen(true)}
          />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4 space-y-4">
            {/* Header with tabs and buttons - responsive */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <TabsList className="w-full lg:w-auto flex-shrink-0 h-auto flex-wrap">
                <TabsTrigger value="cloud" className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <Cloud className="h-4 w-4" />
                  <span className="hidden sm:inline">Cloud</span>
                </TabsTrigger>
                <TabsTrigger value="local" className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <Laptop className="h-4 w-4" />
                  <span className="hidden sm:inline">Local</span>
                </TabsTrigger>
                <TabsTrigger value="dedicated-vm" className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <Server className="h-4 w-4" />
                  <span className="hidden sm:inline">VMs</span>
                  <Badge variant="secondary" className="text-[10px] px-1">Soon</Badge>
                </TabsTrigger>
                <TabsTrigger value="databases" className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <Database className="h-4 w-4" />
                  <span className="hidden sm:inline">Databases</span>
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Button variant="outline" size="sm" onClick={handleRefresh} className="flex-1 sm:flex-none">
                  <RefreshCw className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
                <Button size="sm" onClick={handleCreate} className="flex-1 sm:flex-none">
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">
                    {activeTab === "databases" ? "New Database" : "New Deployment"}
                  </span>
                </Button>
              </div>
            </div>

            <TabsContent value="cloud" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Cloud className="h-5 w-5 text-primary" />
                    Cloud Deployments
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Deploy to Render.com: <span className="font-mono text-primary">env-appname.onrender.com</span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : cloudDeployments.length > 0 ? (
                    <div className="grid gap-4">
                      {cloudDeployments.map((deployment) => (
                        <DeploymentCard
                          key={deployment.id}
                          deployment={deployment}
                          shareToken={shareToken}
                          onUpdate={fetchDeployments}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Cloud className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="mb-3 text-sm">No cloud deployments yet</p>
                      <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create First Deployment
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="local" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Laptop className="h-5 w-5 text-primary" />
                    Local Development
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Download a Node.js package to run locally with hot reload and telemetry.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : localDeployments.length > 0 ? (
                    <div className="grid gap-4">
                      {localDeployments.map((deployment) => (
                        <DeploymentCard
                          key={deployment.id}
                          deployment={deployment}
                          shareToken={shareToken}
                          onUpdate={fetchDeployments}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Laptop className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="mb-3 text-sm">No local configurations yet</p>
                      <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Local Config
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="dedicated-vm" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Server className="h-5 w-5 text-muted-foreground" />
                    Dedicated VMs
                    <Badge variant="secondary">Coming Soon</Badge>
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Deploy to dedicated VMs with SSH access and custom scripts.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    <Server className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="mb-2 text-sm">Dedicated VM deployments are coming soon</p>
                    <p className="text-xs max-w-md mx-auto">
                      Full SSH access, custom deployment scripts, real-time monitoring, and bug telemetry.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="databases" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Database className="h-5 w-5 text-primary" />
                    Databases
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Create and manage PostgreSQL databases. Get connection strings to use in your deployments.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isDatabasesLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : databases.length > 0 ? (
                    <div className="grid gap-4">
                      {databases.map((database) => (
                        <DatabaseCard
                          key={database.id}
                          database={database}
                          shareToken={shareToken}
                          onRefresh={fetchDatabases}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Database className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="mb-3 text-sm">No databases yet</p>
                      <Button size="sm" onClick={() => setIsCreateDatabaseOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create First Database
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <DeploymentDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          projectId={projectId || ""}
          shareToken={shareToken}
          mode="create"
          defaultPlatform={activeTab === "local" ? "local" : "pronghorn_cloud"}
          onSuccess={fetchDeployments}
        />

        <DatabaseDialog
          open={isCreateDatabaseOpen}
          onOpenChange={setIsCreateDatabaseOpen}
          mode="create"
          projectId={projectId || ""}
          shareToken={shareToken}
          onSuccess={fetchDatabases}
          primeRepoName={primeRepoName}
        />
      </div>
    </div>
  );
};

export default Deploy;
