import { useState } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RepoCard } from "@/components/repository/RepoCard";
import { FileTree } from "@/components/repository/FileTree";
import { CreateRepoDialog } from "@/components/repository/CreateRepoDialog";
import { GitBranch, FileCode, Settings, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Repository() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<string>();

  // Mock data - will be replaced with real data from RPC functions
  const mockRepos = [
    {
      id: "1",
      organization: "pronghorn-red",
      repo: "demo-project",
      branch: "main",
      is_default: true,
    },
  ];

  const mockFiles = [
    {
      name: "src",
      path: "src",
      type: "folder" as const,
      children: [
        {
          name: "components",
          path: "src/components",
          type: "folder" as const,
          children: [
            { name: "Button.tsx", path: "src/components/Button.tsx", type: "file" as const },
            { name: "Card.tsx", path: "src/components/Card.tsx", type: "file" as const },
          ],
        },
        { name: "index.ts", path: "src/index.ts", type: "file" as const },
      ],
    },
    { name: "README.md", path: "README.md", type: "file" as const },
    { name: "package.json", path: "package.json", type: "file" as const },
  ];

  const handleCreateEmpty = (name: string) => {
    toast({
      title: "Creating repository",
      description: `Creating empty repository: ${name}`,
    });
    // TODO: Call RPC function
  };

  const handleCreateFromTemplate = (name: string, templateOrg: string, templateRepo: string) => {
    toast({
      title: "Creating from template",
      description: `Cloning ${templateOrg}/${templateRepo} to ${name}`,
    });
    // TODO: Call RPC function
  };

  const handleLinkExisting = (org: string, repo: string, branch: string, pat?: string) => {
    toast({
      title: "Linking repository",
      description: `Linking ${org}/${repo} (${branch})`,
    });
    // TODO: Call RPC function
  };

  const handleDeleteRepo = (repoId: string) => {
    toast({
      title: "Repository removed",
      description: "Repository has been unlinked from this project",
    });
    // TODO: Call RPC function
  };

  const handleManagePAT = (repoId: string) => {
    toast({
      title: "Manage PAT",
      description: "PAT management coming soon",
    });
    // TODO: Open PAT management dialog
  };

  const handleFileSelect = (path: string) => {
    setSelectedFile(path);
    toast({
      title: "File selected",
      description: path,
    });
    // TODO: Load file content via RPC
  };

  const handleSync = () => {
    toast({
      title: "Syncing repositories",
      description: "Pushing changes to GitHub",
    });
    // TODO: Call sync edge function
  };

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      
      <div className="flex relative">
        <ProjectSidebar projectId={projectId!} />
        
        <main className="flex-1 w-full">
          <div className="container px-6 py-8 max-w-7xl">
            <div className="mb-6">
              <h1 className="text-3xl font-bold mb-2">Repository</h1>
              <p className="text-muted-foreground">
                Manage GitHub repositories, files, and synchronization
              </p>
            </div>

            <Tabs defaultValue="repos" className="space-y-6">
              <TabsList>
                <TabsTrigger value="repos" className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  Repositories
                </TabsTrigger>
                <TabsTrigger value="files" className="flex items-center gap-2">
                  <FileCode className="h-4 w-4" />
                  Files
                </TabsTrigger>
                <TabsTrigger value="sync" className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Sync
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Settings
                </TabsTrigger>
              </TabsList>

              <TabsContent value="repos" className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Connected Repositories</CardTitle>
                        <CardDescription>
                          Repositories linked to this project
                        </CardDescription>
                      </div>
                      <CreateRepoDialog
                        onCreateEmpty={handleCreateEmpty}
                        onCreateFromTemplate={handleCreateFromTemplate}
                        onLinkExisting={handleLinkExisting}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {mockRepos.map((repo) => (
                      <RepoCard
                        key={repo.id}
                        repo={repo}
                        onDelete={handleDeleteRepo}
                        onManagePAT={handleManagePAT}
                      />
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="files" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>File Structure</CardTitle>
                      <CardDescription>
                        Browse project files and folders
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FileTree
                        files={mockFiles}
                        onFileSelect={handleFileSelect}
                        selectedPath={selectedFile}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>File Content</CardTitle>
                      <CardDescription>
                        {selectedFile || "Select a file to view its content"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {selectedFile ? (
                        <div className="bg-muted p-4 rounded-md font-mono text-sm">
                          <p className="text-muted-foreground">
                            File content will be displayed here
                          </p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-center py-8">
                          No file selected
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="sync" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Synchronization</CardTitle>
                    <CardDescription>
                      Push and pull changes between database and GitHub
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-4">
                      <Button onClick={handleSync}>
                        Push to GitHub
                      </Button>
                      <Button variant="outline">
                        Pull from GitHub
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Sync functionality will be available once RPC and Edge functions are implemented
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="settings" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Repository Settings</CardTitle>
                    <CardDescription>
                      Configure repository behavior and access
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      Settings panel coming soon
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}
