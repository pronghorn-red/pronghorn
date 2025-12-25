import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { TesseractVisualizer } from "@/components/audit/TesseractVisualizer";
import { AuditBlackboard } from "@/components/audit/AuditBlackboard";
import { VennDiagramResults } from "@/components/audit/VennDiagramResults";
import { AuditConfigurationDialog, AuditConfiguration } from "@/components/audit/AuditConfigurationDialog";
import { AgentInstancesCard } from "@/components/audit/AgentInstancesCard";
import { useRealtimeAudit } from "@/hooks/useRealtimeAudit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PlayCircle,
  Pause,
  StopCircle,
  Settings2,
  Activity,
  Grid3X3,
  MessageSquare,
  CircleDot,
  RefreshCw,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useShareToken } from "@/hooks/useShareToken";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type AuditSession = Database["public"]["Tables"]["audit_sessions"]["Row"];

export default function Audit() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken } = useShareToken(projectId!);
  
  const [sessions, setSessions] = useState<AuditSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>();
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  
  const {
    session,
    blackboardEntries,
    tesseractCells,
    agentInstances,
    isLoading,
    error,
    createSession,
    updateSessionStatus,
    refreshSession,
  } = useRealtimeAudit(projectId!, selectedSessionId);

  // Load all sessions for this project
  useEffect(() => {
    if (!projectId || !shareToken) return;
    
    const loadSessions = async () => {
      const { data, error } = await supabase.rpc("get_audit_sessions_with_token", {
        p_project_id: projectId,
        p_token: shareToken,
      });
      
      if (error) {
        console.error("Failed to load sessions:", error);
        return;
      }
      
      setSessions(data || []);
      
      // Auto-select the most recent active session
      if (data && data.length > 0 && !selectedSessionId) {
        const activeSession = data.find((s: AuditSession) => 
          s.status === "running" || s.status === "agents_active"
        );
        setSelectedSessionId(activeSession?.id || data[0].id);
      }
    };
    
    loadSessions();
  }, [projectId, shareToken, selectedSessionId]);

  const handleStartAudit = async (config: AuditConfiguration) => {
    setIsStarting(true);
    try {
      const agentDefs = config.agentPersonas.reduce((acc, p) => ({
        ...acc,
        [p.id]: { enabled: p.enabled, customPrompt: p.customPrompt },
      }), {});
      
      const newSession = await createSession({
        name: config.name,
        description: config.description,
        dataset1Type: config.dataset1Type,
        dataset1Ids: config.dataset1Ids,
        dataset2Type: config.dataset2Type,
        dataset2Ids: config.dataset2Ids,
        maxIterations: config.maxIterations,
        agentDefinitions: agentDefs,
      });
      
      if (newSession) {
        setSelectedSessionId(newSession.id);
        setSessions((prev) => [newSession, ...prev]);
        setConfigDialogOpen(false);
        toast.success("Audit session created, starting orchestrator...");
        
        // Call the audit-orchestrator edge function
        const { error: orchestratorError } = await supabase.functions.invoke("audit-orchestrator", {
          body: {
            sessionId: newSession.id,
            projectId,
            shareToken,
          },
        });
        
        if (orchestratorError) {
          console.error("Orchestrator error:", orchestratorError);
          toast.error("Failed to start audit orchestrator");
        } else {
          toast.success("Audit orchestrator started");
        }
      }
    } catch (err) {
      toast.error("Failed to start audit");
      console.error(err);
    } finally {
      setIsStarting(false);
    }
  };

  const handlePauseResume = async () => {
    if (!session) return;
    const newStatus = session.status === "paused" ? "running" : "paused";
    await updateSessionStatus(session.id, newStatus);
    toast.success(newStatus === "paused" ? "Audit paused" : "Audit resumed");
  };

  const handleStop = async () => {
    if (!session) return;
    await updateSessionStatus(session.id, "stopped");
    toast.success("Audit stopped");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
      case "agents_active":
      case "analyzing_shape":
        return "bg-green-500";
      case "paused":
        return "bg-yellow-500";
      case "completed":
      case "completed_max_iterations":
        return "bg-blue-500";
      case "stopped":
      case "failed":
        return "bg-red-500";
      default:
        return "bg-muted";
    }
  };

  const activeAgents = agentInstances.filter((a) => a.status === "active");
  const isRunning = session?.status === "running" || session?.status === "agents_active" || session?.status === "analyzing_shape";

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      
      <div className="flex relative">
        <ProjectSidebar projectId={projectId!} />
        
        <main className="flex-1 w-full">
          <div className="container px-6 py-8 max-w-7xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold mb-2">Audit</h1>
                <p className="text-muted-foreground">
                  Multi-agent compliance audits with tesseract visualization
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Session Selector */}
                <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Select session..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No sessions yet
                      </SelectItem>
                    ) : (
                      sessions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${getStatusColor(s.status)}`} />
                            <span className="truncate">{s.name}</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                
                {session && (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => refreshSession(session.id)}
                      disabled={isLoading}
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                    </Button>
                    
                    {isRunning && (
                      <>
                        <Button variant="outline" onClick={handlePauseResume}>
                          {session.status === "paused" ? (
                            <PlayCircle className="h-4 w-4 mr-2" />
                          ) : (
                            <Pause className="h-4 w-4 mr-2" />
                          )}
                          {session.status === "paused" ? "Resume" : "Pause"}
                        </Button>
                        <Button variant="destructive" onClick={handleStop}>
                          <StopCircle className="h-4 w-4 mr-2" />
                          Stop
                        </Button>
                      </>
                    )}
                  </>
                )}
                
                <Button onClick={() => setConfigDialogOpen(true)}>
                  <PlayCircle className="h-4 w-4 mr-2" />
                  New Audit
                </Button>
              </div>
            </div>

            {/* Session Status Bar */}
            {session && (
              <Card className="mb-6">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(session.status)} ${isRunning ? "animate-pulse" : ""}`} />
                        <span className="font-medium capitalize">{session.status.replace(/_/g, " ")}</span>
                      </div>
                      <Badge variant="outline">
                        <Activity className="h-3 w-3 mr-1" />
                        Iteration {session.current_iteration} / {session.max_iterations}
                      </Badge>
                      <Badge variant="secondary">
                        <Users className="h-3 w-3 mr-1" />
                        {activeAgents.length} active agents
                      </Badge>
                      {session.consensus_reached && (
                        <Badge variant="default" className="bg-green-500">
                          Consensus Reached
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {session.dataset_1_type} ↔ {session.dataset_2_type}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Error Display */}
            {error && (
              <Card className="mb-6 border-destructive">
                <CardContent className="py-4">
                  <p className="text-destructive">{error}</p>
                </CardContent>
              </Card>
            )}

            {/* Main Content */}
            {!session ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center h-[400px] gap-4">
                  <Settings2 className="h-12 w-12 text-muted-foreground" />
                  <div className="text-center">
                    <h3 className="font-semibold text-lg">No Audit Session Selected</h3>
                    <p className="text-muted-foreground">
                      Create a new audit or select an existing session to view results.
                    </p>
                  </div>
                  <Button onClick={() => setConfigDialogOpen(true)}>
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Start New Audit
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - Agents */}
                <div className="lg:col-span-1">
                  <AgentInstancesCard 
                    agents={agentInstances}
                    totalElements={tesseractCells.length}
                  />
                </div>

                {/* Right Column - Main Tabs */}
                <div className="lg:col-span-2">
                  <Tabs defaultValue="tesseract" className="space-y-4">
                    <TabsList>
                      <TabsTrigger value="tesseract" className="gap-2">
                        <Grid3X3 className="h-4 w-4" />
                        Tesseract
                        {tesseractCells.length > 0 && (
                          <Badge variant="secondary" className="ml-1">
                            {tesseractCells.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="blackboard" className="gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Blackboard
                        {blackboardEntries.length > 0 && (
                          <Badge variant="secondary" className="ml-1">
                            {blackboardEntries.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="results" className="gap-2">
                        <CircleDot className="h-4 w-4" />
                        Results
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="tesseract">
                      <TesseractVisualizer
                        cells={tesseractCells}
                        currentIteration={session.current_iteration}
                        onCellClick={(cell) => {
                          toast.info(`${cell.x_element_label || cell.x_element_id}: ${cell.evidence_summary || "No evidence"}`);
                        }}
                      />
                    </TabsContent>

                    <TabsContent value="blackboard">
                      <AuditBlackboard
                        entries={blackboardEntries}
                        currentIteration={session.current_iteration}
                      />
                    </TabsContent>

                    <TabsContent value="results">
                      <VennDiagramResults
                        vennResult={session.venn_result}
                        dataset1Label={session.dataset_1_type}
                        dataset2Label={session.dataset_2_type}
                      />
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <AuditConfigurationDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        onStartAudit={handleStartAudit}
        isLoading={isStarting}
        projectId={projectId!}
        shareToken={shareToken}
      />
    </div>
  );
}
