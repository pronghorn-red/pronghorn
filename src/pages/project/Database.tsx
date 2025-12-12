import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database as DatabaseIcon, Plus, RefreshCw, Settings } from "lucide-react";
import { useShareToken } from "@/hooks/useShareToken";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { ProjectPageHeader } from "@/components/layout/ProjectPageHeader";
import { DatabaseCard } from "@/components/deploy/DatabaseCard";
import { DatabaseDialog } from "@/components/deploy/DatabaseDialog";

const Database = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken, isTokenSet } = useShareToken(projectId);
  const [databases, setDatabases] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("deploy");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [primeRepoName, setPrimeRepoName] = useState("");

  // Fetch prime repo name for auto-generating database names
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

  const fetchDatabases = async () => {
    if (!projectId || !isTokenSet) return;
    
    setIsLoading(true);
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
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDatabases();
    fetchPrimeRepoName();
  }, [projectId, isTokenSet, shareToken]);

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
            title="Database"
            onMenuClick={() => setIsSidebarOpen(true)}
          />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4 space-y-4">
            {/* Header with tabs and buttons */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <TabsList className="w-full lg:w-auto flex-shrink-0">
                <TabsTrigger value="deploy" className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <DatabaseIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Deploy</span>
                </TabsTrigger>
                <TabsTrigger value="manage" className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">Manage</span>
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Button variant="outline" size="sm" onClick={fetchDatabases} className="flex-1 sm:flex-none">
                  <RefreshCw className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
                {activeTab === "deploy" && (
                  <Button size="sm" onClick={() => setIsCreateOpen(true)} className="flex-1 sm:flex-none">
                    <Plus className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">New Database</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Deploy Tab - Create and manage database instances */}
            <TabsContent value="deploy" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <DatabaseIcon className="h-5 w-5 text-primary" />
                    Databases
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Create and manage PostgreSQL databases. Get connection strings to use in your deployments.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
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
                      <DatabaseIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="mb-3 text-sm">No databases yet</p>
                      <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create First Database
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Manage Tab - Database Explorer */}
            <TabsContent value="manage" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Settings className="h-5 w-5 text-primary" />
                    Database Management
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Browse schemas, execute SQL, and manage your database structure.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
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
                          showExploreOnly
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <DatabaseIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="mb-3 text-sm">No databases to manage</p>
                      <p className="text-xs">Create a database in the Deploy tab first.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <DatabaseDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
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

export default Database;
