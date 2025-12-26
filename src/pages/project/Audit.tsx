import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { ProjectPageHeader } from "@/components/layout/ProjectPageHeader";
import { TesseractVisualizer } from "@/components/audit/TesseractVisualizer";
import { AuditBlackboard } from "@/components/audit/AuditBlackboard";
import { VennDiagramResults } from "@/components/audit/VennDiagramResults";
import { AuditConfigurationDialog, AuditConfiguration } from "@/components/audit/AuditConfigurationDialog";
import { KnowledgeGraph } from "@/components/audit/KnowledgeGraph";
import { AuditActivityStream } from "@/components/audit/AuditActivityStream";
import { useRealtimeAudit } from "@/hooks/useRealtimeAudit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  Network,
  Brain,
  RotateCcw,
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const staleCheckRef = useRef<NodeJS.Timeout | null>(null);
  const lastResumeAttemptRef = useRef<number>(0);
  const manualStopRef = useRef(false);
  
  const {
    session,
    blackboardEntries,
    tesseractCells,
    agentInstances,
    graphNodes,
    graphEdges,
    activityStream,
    isLoading,
    error,
    createSession,
    updateSessionStatus,
    refreshSession,
    pruneOrphanNodes,
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

  // Resume orchestrator function
  const resumeOrchestrator = useCallback(async (sessionToResume: AuditSession) => {
    if (isResuming) return;
    
    // Prevent rapid re-attempts (wait at least 30s between attempts)
    const now = Date.now();
    if (now - lastResumeAttemptRef.current < 30000) {
      console.log("Skipping resume - too soon since last attempt");
      return;
    }
    lastResumeAttemptRef.current = now;
    
    setIsResuming(true);
    console.log("Resuming stale audit session:", sessionToResume.id);
    
    try {
      const { data, error: orchestratorError } = await supabase.functions.invoke("audit-orchestrator", {
        body: {
          sessionId: sessionToResume.id,
          projectId,
          shareToken,
          resume: true,
        },
      });
      
      // Check for actual errors - edge functions return errors in data.error sometimes
      if (orchestratorError) {
        console.error("Resume orchestrator error:", orchestratorError);
        toast.error("Failed to resume audit: " + (orchestratorError.message || "Unknown error"));
      } else if (data?.error) {
        console.error("Resume returned error in data:", data.error);
        toast.error("Resume error: " + data.error);
      } else {
        // Only show success toast if we actually resumed successfully
        console.log("Audit resumed successfully", data);
        // Don't show toast here - the activity stream will show progress
      }
    } catch (err) {
      console.error("Resume failed:", err);
      toast.error("Failed to resume audit");
    } finally {
      setIsResuming(false);
    }
  }, [projectId, shareToken, isResuming]);

  // Monitor for stale "running" sessions and auto-resume
  useEffect(() => {
    if (!session || !shareToken || !projectId) return;
    
    // Only monitor running sessions
    const isActiveSession = session.status === "running" || session.status === "agents_active" || session.status === "analyzing_shape";
    if (!isActiveSession) {
      if (staleCheckRef.current) {
        clearInterval(staleCheckRef.current);
        staleCheckRef.current = null;
      }
      return;
    }

    const checkForStaleSession = async () => {
      // Don't auto-resume if manually stopped or already resuming
      if (isResuming || manualStopRef.current) return;
      
      // Re-fetch session status from DB to avoid stale state
      const { data: freshSessions } = await supabase.rpc("get_audit_sessions_with_token", {
        p_project_id: projectId,
        p_token: shareToken,
      });
      const freshSession = freshSessions?.find((s: AuditSession) => s.id === session.id);
      
      // Only resume if session is still actually running
      if (!freshSession || freshSession.status !== "running") {
        console.log("Session no longer running, skipping auto-resume");
        return;
      }
      
      const updatedAt = new Date(freshSession.updated_at);
      const staleness = Date.now() - updatedAt.getTime();
      
      // If session hasn't been updated in 70 seconds but still "running", it's likely timed out
      if (staleness > 70000) {
        console.log(`Session appears stale (${Math.round(staleness/1000)}s since last update), auto-resuming...`);
        resumeOrchestrator(freshSession);
      }
    };

    // Check immediately and then every 15 seconds
    checkForStaleSession();
    staleCheckRef.current = setInterval(checkForStaleSession, 15000);

    return () => {
      if (staleCheckRef.current) {
        clearInterval(staleCheckRef.current);
        staleCheckRef.current = null;
      }
    };
  }, [session, projectId, shareToken, isResuming, resumeOrchestrator]);

  // Manual resume handler
  const handleManualResume = async () => {
    if (!session) return;
    await resumeOrchestrator(session);
  };

  const handleStartAudit = async (config: AuditConfiguration) => {
    setIsStarting(true);
    manualStopRef.current = false; // Reset manual stop flag for new audit
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
        dataset1Content: config.dataset1Content,
        dataset2Content: config.dataset2Content,
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
    // Set manual stop flag to prevent auto-resume
    manualStopRef.current = true;
    // Clear stale check immediately
    if (staleCheckRef.current) {
      clearInterval(staleCheckRef.current);
      staleCheckRef.current = null;
    }
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
  const isRunning = session?.status === "running" || session?.status === "agents_active" || session?.status === "analyzing_shape" || session?.status === "pending";
  const currentPhase = (session as any)?.phase;
  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      
      <div className="flex relative">
        <ProjectSidebar projectId={projectId!} isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} />
        
        <main className="flex-1 overflow-auto w-full">
          <div className="px-4 md:px-6 py-6 md:py-8 max-w-7xl mx-auto">
            {/* Header with hamburger */}
            <ProjectPageHeader
              title="Audit"
              subtitle="Multi-agent compliance audits with tesseract visualization"
              onMenuClick={() => setIsSidebarOpen(true)}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  {/* Session Selector */}
                  <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                    <SelectTrigger className="w-[160px] md:w-[220px]">
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
                          <Button variant="outline" size="sm" onClick={handlePauseResume} className="hidden sm:flex">
                            {session.status === "paused" ? (
                              <PlayCircle className="h-4 w-4 mr-2" />
                            ) : (
                              <Pause className="h-4 w-4 mr-2" />
                            )}
                            {session.status === "paused" ? "Resume" : "Pause"}
                          </Button>
                          <Button variant="destructive" size="sm" onClick={handleStop} className="hidden sm:flex">
                            <StopCircle className="h-4 w-4 mr-2" />
                            Stop
                          </Button>
                        </>
                      )}
                      
                      {/* Manual Resume Button for stale sessions */}
                      {session && (session.status === "running" || session.status === "agents_active") && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={handleManualResume}
                          disabled={isResuming}
                          className="hidden sm:flex"
                        >
                          <RotateCcw className={`h-4 w-4 mr-2 ${isResuming ? "animate-spin" : ""}`} />
                          {isResuming ? "Resuming..." : "Resume"}
                        </Button>
                      )}
                    </>
                  )}
                  
                  <Button onClick={() => setConfigDialogOpen(true)} size="sm">
                    <PlayCircle className="h-4 w-4 mr-1 md:mr-2" />
                    <span className="hidden sm:inline">New Audit</span>
                    <span className="sm:hidden">New</span>
                  </Button>
                </div>
              }
            />

            {/* Session Status Bar */}
            {session && (
              <Card className="mb-6">
                <CardContent className="py-3 md:py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(session.status)} ${isRunning ? "animate-pulse" : ""}`} />
                        <span className="font-medium capitalize text-sm">{session.status.replace(/_/g, " ")}</span>
                      </div>
                      {currentPhase && (
                        <Badge variant="outline" className="capitalize text-xs">
                          {currentPhase.replace(/_/g, " ")}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        <Activity className="h-3 w-3 mr-1" />
                        {session.current_iteration}/{session.max_iterations}
                      </Badge>
                      {activeAgents.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {activeAgents.length} active
                        </Badge>
                      )}
                      {session.consensus_reached && (
                        <Badge variant="default" className="bg-green-500 text-xs">
                          Consensus
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
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
              <Tabs defaultValue="activity" className="space-y-4">
                <div className="overflow-x-auto -mx-6 px-6">
                  <TabsList className="inline-flex w-auto min-w-full sm:min-w-0">
                    <TabsTrigger value="activity" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                      <Brain className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Activity</span>
                      <span className="sm:hidden">Act</span>
                      {activityStream.length > 0 && (
                        <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                          {activityStream.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="graph" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                      <Network className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Graph</span>
                      <span className="sm:hidden">Grph</span>
                      {graphNodes.length > 0 && (
                        <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                          {graphNodes.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="tesseract" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                      <Grid3X3 className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Tesseract</span>
                      <span className="sm:hidden">Tess</span>
                      {tesseractCells.length > 0 && (
                        <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                          {tesseractCells.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="blackboard" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                      <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Blackboard</span>
                      <span className="sm:hidden">BB</span>
                      {blackboardEntries.length > 0 && (
                        <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                          {blackboardEntries.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="results" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                      <CircleDot className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Results</span>
                      <span className="sm:hidden">Res</span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="activity">
                  <AuditActivityStream
                    activities={activityStream}
                    isLoading={isLoading}
                  />
                </TabsContent>

                <TabsContent value="graph">
                  <KnowledgeGraph
                    nodes={graphNodes}
                    edges={graphEdges}
                    currentPhase={(session as any)?.phase || "conference"}
                    dataset1Label={session.dataset_1_type}
                    dataset2Label={session.dataset_2_type}
                    onNodeClick={(nodeId) => {
                      toast.info(`Node: ${graphNodes.find(n => n.id === nodeId)?.label || nodeId}`);
                    }}
                    onPruneOrphans={async () => {
                      if (!session) return;
                      const count = await pruneOrphanNodes(session.id);
                      if (count > 0) {
                        toast.success(`Pruned ${count} orphan node${count > 1 ? 's' : ''}`);
                      } else {
                        toast.info("No orphan nodes to prune");
                      }
                    }}
                  />
                </TabsContent>
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
