import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Rocket, Cloud, Laptop, Server, Plus, RefreshCw, Menu } from "lucide-react";
import { useShareToken } from "@/hooks/useShareToken";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { ProjectPageHeader } from "@/components/layout/ProjectPageHeader";
import DeploymentCard from "@/components/deploy/DeploymentCard";
import CreateDeploymentDialog from "@/components/deploy/CreateDeploymentDialog";
import type { Database } from "@/integrations/supabase/types";

type Deployment = Database["public"]["Tables"]["project_deployments"]["Row"];

const Deploy = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken, isTokenSet } = useShareToken(projectId);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("pronghorn-cloud");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

  useEffect(() => {
    fetchDeployments();
  }, [projectId, isTokenSet, shareToken]);

  const cloudDeployments = deployments.filter(d => d.platform === "pronghorn_cloud");
  const localDeployments = deployments.filter(d => d.platform === "local");

  return (
    <div className="flex h-screen bg-background">
      <ProjectSidebar 
        projectId={projectId || ""} 
        isOpen={isSidebarOpen} 
        onOpenChange={setIsSidebarOpen} 
      />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="p-6">
          <ProjectPageHeader
            title="Deploy"
            onMenuClick={() => setIsSidebarOpen(true)}
          />

      <div className="flex-1 overflow-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex items-center justify-between">
            <TabsList className="grid w-auto grid-cols-3">
              <TabsTrigger value="pronghorn-cloud" className="flex items-center gap-2">
                <Cloud className="h-4 w-4" />
                Pronghorn Cloud
              </TabsTrigger>
              <TabsTrigger value="local" className="flex items-center gap-2">
                <Laptop className="h-4 w-4" />
                Local Development
              </TabsTrigger>
              <TabsTrigger value="dedicated-vm" className="flex items-center gap-2">
                <Server className="h-4 w-4" />
                Dedicated VMs
                <Badge variant="secondary" className="ml-1 text-xs">Soon</Badge>
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchDeployments}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Deployment
              </Button>
            </div>
          </div>

          <TabsContent value="pronghorn-cloud" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cloud className="h-5 w-5 text-primary" />
                  Pronghorn Cloud
                </CardTitle>
                <CardDescription>
                  Deploy your application to <span className="font-mono">appname.env.pronghorn.cloud</span> hosted on Render.com.
                  Supports Node.js, Python, Go backends and React, Vue, TanStack frontends.
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
                  <div className="text-center py-12 text-muted-foreground">
                    <Cloud className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="mb-4">No cloud deployments yet</p>
                    <Button onClick={() => setIsCreateOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Deployment
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="local" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Laptop className="h-5 w-5 text-primary" />
                  Local Development
                </CardTitle>
                <CardDescription>
                  Download a Node.js package with pre-configured .env file to run your project locally.
                  Includes file watching, hot reload, and bug telemetry back to Pronghorn.
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
                  <div className="text-center py-12 text-muted-foreground">
                    <Laptop className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="mb-4">No local configurations yet</p>
                    <Button onClick={() => setIsCreateOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Local Config
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dedicated-vm" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-muted-foreground" />
                  Dedicated VMs
                  <Badge variant="secondary">Coming Soon</Badge>
                </CardTitle>
                <CardDescription>
                  Deploy to dedicated virtual machines for better control, monitoring, and real-time bug telemetry.
                  Full automation with SSH access and custom deployment scripts.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="mb-2">Dedicated VM deployments are coming soon</p>
                  <p className="text-sm">
                    This feature will provide dedicated VMs with full SSH access, custom deployment scripts,
                    real-time monitoring, and automatic bug telemetry integration.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <CreateDeploymentDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        projectId={projectId || ""}
        shareToken={shareToken}
        defaultPlatform={activeTab === "local" ? "local" : "pronghorn_cloud"}
        onCreated={fetchDeployments}
      />
    </div>
  </div>
  );
};

export default Deploy;
    </div>
  );
};

export default Deploy;
