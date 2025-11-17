import { useState } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { AgentStatusVisualizer, Agent } from "@/components/build/AgentStatusVisualizer";
import { LogViewer, LogEntry } from "@/components/build/LogViewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useParams } from "react-router-dom";
import { Play, Square, ExternalLink } from "lucide-react";

// Mock data
const mockAgents: Agent[] = [
  {
    id: "1",
    name: "Code Generator",
    type: "Builder",
    status: "active",
    currentTask: "Creating Button component...",
    progress: 67,
  },
  {
    id: "2",
    name: "Integration Agent",
    type: "Integrator",
    status: "active",
    currentTask: "Updating API routes...",
    progress: 45,
  },
  {
    id: "3",
    name: "Auditor Agent",
    type: "Auditor",
    status: "idle",
  },
  {
    id: "4",
    name: "Fixer Agent",
    type: "Fixer",
    status: "completed",
    currentTask: "Fixed validation errors",
  },
  {
    id: "5",
    name: "Deployment Agent",
    type: "Deployer",
    status: "idle",
  },
];

const mockLogs: LogEntry[] = [
  {
    id: "1",
    timestamp: new Date(Date.now() - 60000),
    agent: "Code Generator",
    level: "info",
    message: "Starting code generation for Login component",
  },
  {
    id: "2",
    timestamp: new Date(Date.now() - 45000),
    agent: "Code Generator",
    level: "success",
    message: "Successfully created src/components/auth/Login.tsx",
  },
  {
    id: "3",
    timestamp: new Date(Date.now() - 30000),
    agent: "Integration Agent",
    level: "info",
    message: "Updating router configuration...",
  },
  {
    id: "4",
    timestamp: new Date(Date.now() - 20000),
    agent: "Auditor Agent",
    level: "warning",
    message: "Found 3 compliance gaps in authentication flow",
  },
  {
    id: "5",
    timestamp: new Date(Date.now() - 10000),
    agent: "Fixer Agent",
    level: "info",
    message: "Applying fixes for validation issues...",
  },
  {
    id: "6",
    timestamp: new Date(Date.now() - 5000),
    agent: "Fixer Agent",
    level: "success",
    message: "All validation fixes applied successfully",
  },
];

export default function Build() {
  const { projectId } = useParams<{ projectId: string }>();
  const [isBuilding, setIsBuilding] = useState(false);
  const [currentEpoch, setCurrentEpoch] = useState(3);
  const [maxEpochs] = useState(10);
  const [coverage, setCoverage] = useState(87);

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      
      <div className="flex">
        <ProjectSidebar projectId={projectId!} />
        
        <main className="flex-1">
          <div className="container px-6 py-8 max-w-7xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold mb-2">Build Mode</h1>
                <p className="text-muted-foreground">
                  Autonomous code generation and deployment
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                {!isBuilding ? (
                  <Button size="lg" className="gap-2" onClick={() => setIsBuilding(true)}>
                    <Play className="h-4 w-4" />
                    Activate Build
                  </Button>
                ) : (
                  <Button size="lg" variant="destructive" className="gap-2" onClick={() => setIsBuilding(false)}>
                    <Square className="h-4 w-4" />
                    Stop Build
                  </Button>
                )}
              </div>
            </div>

            {/* Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Build Status</CardDescription>
                  <CardTitle className="text-2xl">
                    {isBuilding ? (
                      <Badge variant="secondary" className="bg-success/10 text-success">
                        Running
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-muted text-muted-foreground">
                        Idle
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Current Epoch</CardDescription>
                  <CardTitle className="text-2xl">
                    {currentEpoch} / {maxEpochs}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${(currentEpoch / maxEpochs) * 100}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Coverage</CardDescription>
                  <CardTitle className="text-2xl">{coverage}%</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                      style={{ width: `${coverage}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Preview Deployment */}
            {isBuilding && (
              <Card className="mb-8 border-success/50 bg-success/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                    Preview Deployment Ready
                  </CardTitle>
                  <CardDescription>
                    Your application has been deployed and is ready for testing
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Open Preview
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <AgentStatusVisualizer agents={mockAgents} />
              <LogViewer logs={mockLogs} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
