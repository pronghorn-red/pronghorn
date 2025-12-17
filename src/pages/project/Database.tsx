import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database as DatabaseIcon, Plus, RefreshCw, Settings, ChevronLeft, Link } from "lucide-react";
import { useShareToken } from "@/hooks/useShareToken";
import { TokenRecoveryMessage } from "@/components/project/TokenRecoveryMessage";
import { useRealtimeDatabases } from "@/hooks/useRealtimeDatabases";
import { useRealtimeExternalDatabases } from "@/hooks/useRealtimeExternalDatabases";
import { supabase } from "@/integrations/supabase/client";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { ProjectPageHeader } from "@/components/layout/ProjectPageHeader";
import { DatabaseCard } from "@/components/deploy/DatabaseCard";
import { ExternalDatabaseCard } from "@/components/deploy/ExternalDatabaseCard";
import { DatabaseDialog } from "@/components/deploy/DatabaseDialog";
import { ConnectDatabaseDialog } from "@/components/deploy/ConnectDatabaseDialog";
import { DatabaseExplorer } from "@/components/deploy/DatabaseExplorer";
import { useIsMobile } from "@/hooks/use-mobile";

const Database = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken, isTokenSet, tokenMissing } = useShareToken(projectId);
  const isMobile = useIsMobile();
  
  // Project databases (Render)
  const { databases, isLoading, refresh, broadcastRefresh } = useRealtimeDatabases(
    projectId,
    shareToken,
    isTokenSet
  );
  
  // External database connections
  const { 
    connections: externalConnections, 
    isLoading: isLoadingExternal, 
    refresh: refreshExternal,
    broadcastRefresh: broadcastRefreshExternal 
  } = useRealtimeExternalDatabases(projectId, shareToken, isTokenSet);
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("deploy");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [primeRepoName, setPrimeRepoName] = useState("");
  const [selectedDatabase, setSelectedDatabase] = useState<any>(null);
  const [selectedExternalConnection, setSelectedExternalConnection] = useState<any>(null);

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

  useEffect(() => {
    fetchPrimeRepoName();
  }, [projectId, isTokenSet, shareToken]);

  const handleUpdate = () => {
    refresh();
    broadcastRefresh();
  };

  const handleExternalUpdate = () => {
    refreshExternal();
    broadcastRefreshExternal();
  };

  const handleExploreDatabase = (database: any) => {
    setSelectedDatabase(database);
    setSelectedExternalConnection(null);
  };

  const handleExploreExternalConnection = (connection: any) => {
    setSelectedExternalConnection(connection);
    setSelectedDatabase(null);
  };

  const handleBackFromExplorer = () => {
    setSelectedDatabase(null);
    setSelectedExternalConnection(null);
  };

  if (tokenMissing) {
    return (
      <div className="flex h-screen bg-background">
        <TokenRecoveryMessage />
      </div>
    );
  }

  // If a database or external connection is selected for exploration, show the full explorer
  if (selectedDatabase || selectedExternalConnection) {
    return (
      <div className="flex h-screen bg-background">
        <ProjectSidebar 
          projectId={projectId || ""} 
          isOpen={isSidebarOpen} 
          onOpenChange={setIsSidebarOpen} 
        />
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {isMobile && (
            <div className="border-b bg-background px-3 py-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarOpen(true)}
                className="h-8 w-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div className="flex-1 min-h-0">
            <DatabaseExplorer
              database={selectedDatabase}
              externalConnection={selectedExternalConnection}
              shareToken={shareToken}
              onBack={handleBackFromExplorer}
            />
          </div>
        </div>
      </div>
    );
  }

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
                <Button variant="outline" size="sm" onClick={() => { refresh(); refreshExternal(); }} className="flex-1 sm:flex-none">
                  <RefreshCw className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
                {activeTab === "deploy" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setIsConnectOpen(true)} className="flex-1 sm:flex-none">
                      <Link className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Connect</span>
                    </Button>
                    <Button size="sm" onClick={() => setIsCreateOpen(true)} className="flex-1 sm:flex-none">
                      <Plus className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">New Database</span>
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Deploy Tab - Create and manage database instances */}
            <TabsContent value="deploy" className="space-y-6 mt-4">
              {/* Project Databases (Render) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <DatabaseIcon className="h-5 w-5 text-primary" />
                    Project Databases
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Create and manage PostgreSQL databases hosted on Render. Get connection strings to use in your deployments.
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
                          onRefresh={handleUpdate}
                          onExplore={() => handleExploreDatabase(database)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <DatabaseIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="mb-3 text-sm">No project databases yet</p>
                      <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create First Database
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Connected Databases (External) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Link className="h-5 w-5 text-primary" />
                    Connected Databases
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Connect to existing PostgreSQL databases using connection strings. Owner access required.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingExternal ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : externalConnections.length > 0 ? (
                    <div className="grid gap-4">
                      {externalConnections.map((connection) => (
                        <ExternalDatabaseCard
                          key={connection.id}
                          connection={connection}
                          shareToken={shareToken}
                          onRefresh={handleExternalUpdate}
                          onExplore={() => handleExploreExternalConnection(connection)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Link className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="mb-3 text-sm">No connected databases</p>
                      <Button size="sm" variant="outline" onClick={() => setIsConnectOpen(true)}>
                        <Link className="h-4 w-4 mr-2" />
                        Connect Database
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Manage Tab - Database Explorer */}
            <TabsContent value="manage" className="space-y-6 mt-4">
              {/* Project Databases */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <DatabaseIcon className="h-5 w-5 text-primary" />
                    Project Databases
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
                          onRefresh={handleUpdate}
                          onExplore={() => handleExploreDatabase(database)}
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

              {/* Connected Databases */}
              {externalConnections.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Link className="h-5 w-5 text-primary" />
                      Connected Databases
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Explore and query your external database connections.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingExternal ? (
                      <div className="flex items-center justify-center py-12">
                        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {externalConnections.map((connection) => (
                          <ExternalDatabaseCard
                            key={connection.id}
                            connection={connection}
                            shareToken={shareToken}
                            onRefresh={handleExternalUpdate}
                            onExplore={() => handleExploreExternalConnection(connection)}
                            showExploreOnly
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <DatabaseDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          mode="create"
          projectId={projectId || ""}
          shareToken={shareToken}
          onSuccess={handleUpdate}
          primeRepoName={primeRepoName}
        />

        <ConnectDatabaseDialog
          open={isConnectOpen}
          onOpenChange={setIsConnectOpen}
          projectId={projectId || ""}
          shareToken={shareToken}
          onSuccess={handleExternalUpdate}
        />
      </div>
    </div>
  );
};

export default Database;
