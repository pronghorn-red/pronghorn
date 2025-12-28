import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { ProjectPageHeader } from "@/components/layout/ProjectPageHeader";
import { TesseractVisualizer } from "@/components/audit/TesseractVisualizer";
import { AuditBlackboard } from "@/components/audit/AuditBlackboard";
import { VennDiagramResults } from "@/components/audit/VennDiagramResults";
import { FitGapResults } from "@/components/audit/FitGapResults";
import { AuditConfigurationDialog, AuditConfiguration } from "@/components/audit/AuditConfigurationDialog";
import { KnowledgeGraph } from "@/components/audit/KnowledgeGraphWebGL";
import { PipelineActivityStream } from "@/components/audit/PipelineActivityStream";
import { useRealtimeAudit } from "@/hooks/useRealtimeAudit";
import { useAuditPipeline, PipelineProgress, PipelineResults, LocalGraphNode, LocalGraphEdge, PipelineStepId } from "@/hooks/useAuditPipeline";
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
  Loader2,
  Save,
  Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useShareToken } from "@/hooks/useShareToken";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type AuditSession = Database["public"]["Tables"]["audit_sessions"]["Row"];

// Lightweight type for session list (no heavy JSONB fields)
type AuditSessionListItem = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  current_iteration: number;
  max_iterations: number;
  phase: string | null;
};

export default function Audit() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken } = useShareToken(projectId!);
  
  const [sessions, setSessions] = useState<AuditSessionListItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>();
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [usePipeline, setUsePipeline] = useState(true); // Use new pipeline by default
  const manualStopRef = useRef(false);
  const [loadedSessionId, setLoadedSessionId] = useState<string | undefined>();
  
  // Store D1/D2 elements for Tesseract visualization
  const [d1Elements, setD1Elements] = useState<Array<{ id: string; label: string; content: string; category: string }>>([]);
  const [d2Elements, setD2Elements] = useState<Array<{ id: string; label: string; content: string; category: string }>>([]);
  const [d1Label, setD1Label] = useState("D1");
  const [d2Label, setD2Label] = useState("D2");
  
  // New pipeline hook
  const { runPipeline, isRunning: isPipelineRunning, progress: pipelineProgress, steps: pipelineSteps, error: pipelineError, abort: abortPipeline, results: pipelineResults, clearResults: clearPipelineResults, restartStep: restartPipelineStep, reconstructStepsFromActivity, stepMode, setStepMode, pausedAfterStep, continueToNextStep } = useAuditPipeline();
  
  const {
    session,
    blackboardEntries,
    tesseractCells,
    graphNodes,
    graphEdges,
    activityStream,
    isLoading,
    error,
    createSession,
    updateSessionStatus,
    refreshSession,
    pruneOrphanNodes,
    setLocalSession,
    addGraphNodes,
    addGraphEdges,
    removeGraphNodes,
    saveAuditData,
  } = useRealtimeAudit(projectId!, loadedSessionId);

  // Load all sessions for this project (lightweight - only metadata, no heavy JSONB fields)
  useEffect(() => {
    if (!projectId || !shareToken) return;
    
    const loadSessions = async () => {
      const { data, error } = await supabase.rpc("get_audit_sessions_list_with_token", {
        p_project_id: projectId,
        p_token: shareToken,
      });
      
      if (error) {
        console.error("Failed to load sessions:", error);
        return;
      }
      
      setSessions(data || []);
    };
    
    loadSessions();
  }, [projectId, shareToken]);

  // Auto-selection removed - users must manually select and load sessions

  // Reconstruct pipeline steps from activity stream when loading an existing session
  useEffect(() => {
    // Only reconstruct if we have activity data and the pipeline isn't running
    if (!isPipelineRunning && activityStream.length > 0 && pipelineSteps.length === 0) {
      reconstructStepsFromActivity(activityStream);
    }
  }, [activityStream, isPipelineRunning, pipelineSteps.length, reconstructStepsFromActivity]);

  // Reconstruct D1/D2 elements from graph nodes when loading an existing session
  useEffect(() => {
    if (session && graphNodes.length > 0 && d1Elements.length === 0 && d2Elements.length === 0) {
      // Extract D1 elements from graph nodes (node_type = 'd1_element')
      const d1FromGraph = graphNodes
        .filter(node => node.node_type === 'd1_element')
        .map(node => ({
          id: node.source_element_ids?.[0] || node.id,
          label: node.label,
          content: node.description || '',
          category: 'd1',
        }));
      
      // Extract D2 elements from graph nodes (node_type = 'd2_element')
      const d2FromGraph = graphNodes
        .filter(node => node.node_type === 'd2_element')
        .map(node => ({
          id: node.source_element_ids?.[0] || node.id,
          label: node.label,
          content: node.description || '',
          category: 'd2',
        }));
      
      if (d1FromGraph.length > 0) setD1Elements(d1FromGraph);
      if (d2FromGraph.length > 0) setD2Elements(d2FromGraph);
      
      // Set labels from session dataset types
      if (session.dataset_1_type) setD1Label(session.dataset_1_type);
      if (session.dataset_2_type) setD2Label(session.dataset_2_type);
    }
  }, [session, graphNodes, d1Elements.length, d2Elements.length]);

  const resumeOrchestrator = useCallback(async (sessionToResume: AuditSession) => {
    if (isResuming) return;
    
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
      
      // Detect timeout vs real error - Edge Functions timeout after ~60s but continue running
      const isTimeout = orchestratorError?.message?.includes('timeout') || 
                        orchestratorError?.message?.includes('connection') ||
                        orchestratorError?.message?.includes('body stream') ||
                        orchestratorError?.message?.includes('EOF') ||
                        orchestratorError?.message?.includes('network') ||
                        orchestratorError?.message?.includes('Failed to send') ||
                        orchestratorError?.name === 'FunctionsRelayError' ||
                        orchestratorError?.name === 'FunctionsFetchError';
      
      // Check for actual errors - edge functions return errors in data.error sometimes
      if (orchestratorError && !isTimeout) {
        console.error("Resume orchestrator error:", orchestratorError);
        toast.error("Failed to resume audit: " + (orchestratorError.message || "Unknown error"));
      } else if (data?.error) {
        console.error("Resume returned error in data:", data.error);
        toast.error("Resume error: " + data.error);
      } else if (isTimeout) {
        // Don't show error for timeouts - function continues in background
        console.log("Edge function timed out but continues running in background");
      } else {
        // Only show success toast if we actually resumed successfully
        console.log("Audit resumed successfully", data);
        // Don't show toast here - the activity stream will show progress
      }
    } catch (err: any) {
      // Check if this is a timeout-related error (Edge Functions timeout but continue running)
      const isTimeout = err?.message?.includes('timeout') || 
                        err?.message?.includes('connection') ||
                        err?.message?.includes('body stream') ||
                        err?.message?.includes('EOF') ||
                        err?.message?.includes('network') ||
                        err?.message?.includes('Failed to send') ||
                        err?.name === 'FunctionsRelayError' ||
                        err?.name === 'FunctionsFetchError';
      
      if (!isTimeout) {
        console.error("Resume failed:", err);
        toast.error("Failed to resume audit");
      } else {
        console.log("Edge function timed out but continues running in background");
      }
    } finally {
      setIsResuming(false);
    }
  }, [projectId, shareToken, isResuming]);


  // Manual resume handler
  const handleManualResume = async () => {
    if (!session) return;
    await resumeOrchestrator(session);
  };

  // Load session data when user explicitly clicks "Load"
  const handleLoadSession = () => {
    if (selectedSessionId) {
      setLoadedSessionId(selectedSessionId);
    }
  };

  const handleStartAudit = async (config: AuditConfiguration) => {
    setIsStarting(true);
    manualStopRef.current = false;
    try {
      const newSession = await createSession({
        name: config.name,
        description: config.description,
        dataset1Type: config.dataset1Type,
        dataset1Ids: config.dataset1Ids,
        dataset2Type: config.dataset2Type,
        dataset2Ids: config.dataset2Ids,
        maxIterations: 100, // Fixed default
        agentDefinitions: {},
        dataset1Content: config.dataset1Content,
        dataset2Content: config.dataset2Content,
      });
      
      if (newSession) {
        setSelectedSessionId(newSession.id);
        // DON'T set loadedSessionId - keeps useRealtimeAudit from loading empty DB data
        // loadedSessionId will be set after user clicks "Save to Database"
        // Instead, set session locally so UI can display it
        setLocalSession(newSession);
        setSessions((prev) => [newSession, ...prev]);
        setConfigDialogOpen(false);
        
        if (usePipeline && config.dataset1Content) {
          // Use new pipeline - requires at least D1 content (D2 can be empty for single-mode audit)
          toast.success("Audit session created, starting pipeline...");
          
          // Extract elements from ProjectSelectionResult
          // Stringify entire object as content to ensure nothing is missed
          const extractElements = (content: typeof config.dataset1Content) => {
            const elements: Array<{ id: string; label: string; content: string; category: string }> = [];
            
            // Requirements - stringify entire object
            content.requirements?.forEach(r => {
              elements.push({
                id: r.id,
                label: r.title || r.code || r.text?.slice(0, 50) || "Requirement",
                content: JSON.stringify(r),
                category: "requirements",
              });
            });
            
            // Artifacts - stringify entire object
            content.artifacts?.forEach(a => {
              elements.push({
                id: a.id,
                label: a.ai_title || a.content?.slice(0, 50) || "Artifact",
                content: JSON.stringify(a),
                category: "artifacts",
              });
            });
            
            // Standards - stringify entire object
            content.standards?.forEach(s => {
              elements.push({
                id: s.id,
                label: s.code ? `${s.code}: ${s.title}` : (s.title || "Standard"),
                content: JSON.stringify(s),
                category: "standards",
              });
            });
            
            // Files - stringify entire object
            content.files?.forEach((f) => {
              elements.push({
                id: f.id,
                label: f.path,
                content: JSON.stringify(f),
                category: "files",
              });
            });
            
            // Canvas Nodes - stringify entire object
            content.canvasNodes?.forEach(n => {
              elements.push({
                id: n.id,
                label: n.data?.label || n.type || "Node",
                content: JSON.stringify(n),
                category: "canvas",
              });
            });
            
            // Databases - stringify entire object
            content.databases?.forEach(d => {
              elements.push({
                id: d.id,
                label: `${d.schemaName}.${d.name}`,
                content: JSON.stringify(d),
                category: "database",
              });
            });
            
            return elements;
          };
          
          const extractedD1 = extractElements(config.dataset1Content);
          const extractedD2 = config.dataset2Content ? extractElements(config.dataset2Content) : [];
          
          // Store elements in state for Tesseract visualization
          setD1Elements(extractedD1);
          setD2Elements(extractedD2);
          setD1Label(config.dataset1Type);
          setD2Label(config.dataset2Type);
          
          // Run the pipeline (now fully local - no DB writes)
          await runPipeline({
            sessionId: newSession.id,
            projectId: projectId!,
            shareToken: shareToken!,
            d1Elements: extractedD1,
            d2Elements: extractedD2,
            // Pass processing settings
            consolidationLevel: config.consolidationLevel,
            chunkSize: config.chunkSize,
            batchSize: config.batchSize,
            mappingMode: config.mappingMode,
            // Pass enhanced sort settings
            enhancedSortEnabled: config.enhancedSortEnabled,
            enhancedSortActions: config.enhancedSortActions,
            // Pass step mode
            stepMode,
          });
          
          // Refresh session data after pipeline completes
          await refreshSession(newSession.id);
          toast.success("Audit pipeline complete!");
        } else {
          // Fall back to old orchestrator
          toast.success("Audit session created, starting orchestrator...");
          
          const { data, error: orchestratorError } = await supabase.functions.invoke("audit-orchestrator", {
            body: {
              sessionId: newSession.id,
              projectId,
              shareToken,
            },
          });
          
          const isTimeout = orchestratorError?.message?.includes('timeout') || 
                            orchestratorError?.message?.includes('connection') ||
                            orchestratorError?.message?.includes('body stream') ||
                            orchestratorError?.message?.includes('EOF') ||
                            orchestratorError?.message?.includes('network') ||
                            orchestratorError?.message?.includes('Failed to send') ||
                            orchestratorError?.message?.includes('aborted') ||
                            orchestratorError?.name === 'FunctionsRelayError' ||
                            orchestratorError?.name === 'FunctionsFetchError';
          
          if (orchestratorError && !isTimeout) {
            console.error("Orchestrator error:", orchestratorError);
            toast.error("Failed to start audit orchestrator");
          } else if (data?.error) {
            toast.error("Orchestrator error: " + data.error);
          } else if (!isTimeout) {
            toast.success("Audit orchestrator started");
          }
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
    await updateSessionStatus(session.id, "stopped");
    toast.success("Audit stopped");
  };

  // Save complete pipeline results to database
  const handleSaveResults = async () => {
    if (!session || !pipelineResults || isSaving) return;
    
    setIsSaving(true);
    try {
      // Transform nodes for database
      const nodesToSave = pipelineResults.nodes.map(n => ({
        id: n.id,
        label: n.label,
        description: n.description,
        node_type: n.node_type,
        source_dataset: n.source_dataset,
        source_element_ids: n.source_element_ids,
        color: n.color,
        size: n.size,
        metadata: n.metadata,
        created_by_agent: "pipeline",
      }));
      
      // Transform edges for database
      const edgesToSave = pipelineResults.edges.map(e => ({
        id: e.id,
        source_node_id: e.source_node_id,
        target_node_id: e.target_node_id,
        edge_type: e.edge_type,
        label: e.label,
        weight: e.weight,
        metadata: e.metadata,
        created_by_agent: "pipeline",
      }));
      
      // Transform tesseract cells for database
      // Helper to validate UUID format
      const isValidUuid = (str: string) => 
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      
      const cellsToSave = pipelineResults.tesseractCells.map((c, idx) => {
        // Use the cell's own id as x_element_id (it should be a proper UUID)
        // Or check if d1ElementIds[0] is a valid UUID, otherwise use cell id
        const xElementId = (c.d1ElementIds[0] && isValidUuid(c.d1ElementIds[0])) 
          ? c.d1ElementIds[0] 
          : c.id; // cell.id is already a UUID from the pipeline
          
        return {
          id: c.id,
          x_index: idx,
          x_element_id: xElementId,
          x_element_type: "concept",
          x_element_label: c.conceptLabel,
          y_step: 0,
          y_step_label: "Alignment",
          z_polarity: c.polarity,
          z_criticality: c.polarity > 0.5 ? "high" : c.polarity > 0 ? "medium" : "low",
          evidence_summary: c.rationale,
          evidence_refs: { d1Ids: c.d1ElementIds, d2Ids: c.d2ElementIds },
          contributing_agents: ["pipeline"],
        };
      });
      
      // Transform pipeline steps to activity log
      const activityToSave = pipelineSteps.map(step => ({
        agent_role: "pipeline",
        activity_type: "pipeline_step",
        title: step.title,
        content: step.message,
        metadata: { 
          phase: step.phase, 
          status: step.status, 
          progress: step.progress,
          details: step.details,
        },
      }));
      
      // Call batch save function
      const result = await saveAuditData(session.id, {
        nodes: nodesToSave,
        edges: edgesToSave,
        tesseractCells: cellsToSave,
        vennResult: pipelineResults.vennResult,
        activityLog: activityToSave,
        markComplete: true,
      });
      
      if (!result.success) {
        throw new Error(result.error || "Save failed");
      }
      
      // Now set loadedSessionId to load from database (data is now saved)
      setLoadedSessionId(session.id);
      
      // Clear pipeline results since data is now in DB
      clearPipelineResults();
      
      toast.success(`Saved complete audit: ${nodesToSave.length} nodes, ${edgesToSave.length} edges, ${cellsToSave.length} cells`);
    } catch (err: any) {
      console.error("Save failed:", err);
      toast.error("Failed to save results: " + (err.message || "Unknown error"));
    } finally {
      setIsSaving(false);
    }
  };

  // Download complete audit as JSON
  const handleDownloadAudit = () => {
    if (!session) return;
    
    const nodes = pipelineResults?.nodes || graphNodes;
    const edges = pipelineResults?.edges || graphEdges;
    const cells = pipelineResults?.tesseractCells?.map((c, idx) => ({
      id: c.id,
      conceptLabel: c.conceptLabel,
      conceptDescription: c.conceptDescription,
      polarity: c.polarity,
      rationale: c.rationale,
      d1ElementIds: c.d1ElementIds,
      d2ElementIds: c.d2ElementIds,
    })) || tesseractCells;
    const venn = pipelineResults?.vennResult || session.venn_result;
    
    const auditData = {
      session: {
        id: session.id,
        name: session.name,
        description: session.description,
        dataset1Type: session.dataset_1_type,
        dataset2Type: session.dataset_2_type,
        status: session.status,
        createdAt: session.created_at,
        completedAt: session.completed_at,
      },
      nodes,
      edges,
      tesseractCells: cells,
      vennResult: venn,
      activityLog: pipelineSteps.length > 0 ? pipelineSteps : activityStream,
      blackboard: blackboardEntries,
      exportedAt: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(auditData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${session.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success("Audit downloaded");
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

  // Agent instances removed - pipeline-based audit doesn't use individual agents
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
                  
                  {/* Load Session button - show when session selected but not loaded */}
                  {selectedSessionId && selectedSessionId !== loadedSessionId && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleLoadSession}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Load
                    </Button>
                  )}
                  
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
                  
                  {/* Step Mode Toggle - before starting audit */}
                  <div className="hidden sm:flex items-center gap-2 mr-2">
                    <input
                      type="checkbox"
                      id="stepModeToggle"
                      checked={stepMode}
                      onChange={(e) => setStepMode(e.target.checked)}
                      className="w-4 h-4 rounded border-border"
                    />
                    <label htmlFor="stepModeToggle" className="text-xs text-muted-foreground whitespace-nowrap">
                      Step Mode
                    </label>
                  </div>
                  
                  <Button onClick={() => setConfigDialogOpen(true)} size="sm">
                    <PlayCircle className="h-4 w-4 mr-1 md:mr-2" />
                    <span className="hidden sm:inline">New Audit</span>
                    <span className="sm:hidden">New</span>
                  </Button>
                </div>
              }
            />

            {/* Not Loaded Message */}
            {selectedSessionId && selectedSessionId !== loadedSessionId && (
              <Card className="mb-6 border-muted">
                <CardContent className="py-4">
                  <div className="flex items-center justify-center gap-3 text-muted-foreground">
                    <Download className="h-5 w-5" />
                    <p className="text-sm">
                      Select "Load" to view this session's data
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Session Status Bar */}
            {session && (
              <Card className="mb-6">
                <CardContent className="py-3 md:py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${isPipelineRunning ? "bg-green-500 animate-pulse" : getStatusColor(session.status)} ${isRunning && !isPipelineRunning ? "animate-pulse" : ""}`} />
                        <span className="font-medium capitalize text-sm">
                          {isPipelineRunning ? pipelineProgress.phase.replace(/_/g, " ") : session.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      
                      {/* Pipeline Progress - show step progress when pipeline is running */}
                      {(isPipelineRunning || pipelineSteps.length > 0) && (
                        <>
                          {(() => {
                            const completedSteps = pipelineSteps.filter(s => s.status === 'completed').length;
                            const totalSteps = pipelineSteps.length;
                            const currentStep = pipelineSteps.find(s => s.status === 'running');
                            return (
                              <>
                                <Badge variant="outline" className="text-xs">
                                  <Activity className="h-3 w-3 mr-1" />
                                  {completedSteps}/{totalSteps} steps
                                </Badge>
                                {currentStep && (
                                  <Badge variant="secondary" className="text-xs">
                                    {currentStep.title}
                                  </Badge>
                                )}
                              </>
                            );
                          })()}
                        </>
                      )}
                      
                      {/* Legacy orchestrator info - only show if not using pipeline */}
                      {!isPipelineRunning && pipelineSteps.length === 0 && (
                        <>
                          {currentPhase && (
                            <Badge variant="outline" className="capitalize text-xs">
                              {currentPhase.replace(/_/g, " ")}
                            </Badge>
                          )}
                          {session.current_iteration > 0 && (
                            <Badge variant="outline" className="text-xs">
                              <Activity className="h-3 w-3 mr-1" />
                              {session.current_iteration}/{session.max_iterations}
                            </Badge>
                          )}
                        </>
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

            {/* Step Mode Toggle & Paused State */}
            {(isPipelineRunning || pausedAfterStep) && (
              <Card className={`mb-6 ${pausedAfterStep ? "border-amber-500" : "border-border"}`}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="stepMode"
                          checked={stepMode}
                          onChange={(e) => setStepMode(e.target.checked)}
                          disabled={isPipelineRunning && !pausedAfterStep}
                          className="w-4 h-4 rounded border-border"
                        />
                        <label htmlFor="stepMode" className="text-sm font-medium">
                          Step-through Mode
                        </label>
                      </div>
                      {pausedAfterStep && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500">
                          Paused after: {pausedAfterStep}
                        </Badge>
                      )}
                    </div>
                    {pausedAfterStep && (
                      <Button onClick={continueToNextStep} size="sm" className="bg-amber-600 hover:bg-amber-700">
                        <PlayCircle className="h-4 w-4 mr-2" />
                        Continue to Next Step
                      </Button>
                    )}
                  </div>
                  {pausedAfterStep && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Inspect the Graph and Tesseract tabs to verify concept-element linkages before continuing.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Pipeline Complete - Save Results */}
            {!isPipelineRunning && pipelineResults && pipelineProgress.phase === "completed" && (
              <Card className="mb-6 border-green-500">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <p className="font-medium text-green-600">Pipeline Complete</p>
                      <p className="text-sm text-muted-foreground">
                        {pipelineResults.nodes.length} nodes, {pipelineResults.edges.length} edges, {pipelineResults.tesseractCells.length} tesseract cells
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button 
                        onClick={handleSaveResults} 
                        disabled={isSaving}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save to Database
                      </Button>
                      <Button variant="outline" onClick={handleDownloadAudit}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                      <Button variant="outline" onClick={clearPipelineResults}>
                        Discard
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Saved Session - Download option */}
            {!isPipelineRunning && !pipelineResults && session?.status === "completed" && (
              <Card className="mb-6 border-blue-500/50">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <p className="font-medium text-blue-600">Audit Complete</p>
                      <p className="text-sm text-muted-foreground">
                        {graphNodes.length} nodes, {graphEdges.length} edges, {tesseractCells.length} tesseract cells
                      </p>
                    </div>
                    <Button variant="outline" onClick={handleDownloadAudit}>
                      <Download className="h-4 w-4 mr-2" />
                      Download Audit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Error Display */}
            {(error || pipelineError) && (
              <Card className="mb-6 border-destructive">
                <CardContent className="py-4">
                  <p className="text-destructive">{error || pipelineError}</p>
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
                      {(pipelineSteps.length > 0 || activityStream.length > 0) && (
                        <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                          {pipelineSteps.length > 0 ? pipelineSteps.length : activityStream.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="graph" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                      <Network className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Graph</span>
                      <span className="sm:hidden">Grph</span>
                      {(pipelineResults?.nodes?.length || graphNodes.length) > 0 && (
                        <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                          {pipelineResults?.nodes?.length || graphNodes.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="tesseract" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                      <Grid3X3 className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Tesseract</span>
                      <span className="sm:hidden">Tess</span>
                      {(pipelineResults?.tesseractCells?.length || tesseractCells.length) > 0 && (
                        <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                          {pipelineResults?.tesseractCells?.length || tesseractCells.length}
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
                  <PipelineActivityStream
                    steps={pipelineSteps}
                    isRunning={isPipelineRunning}
                    onRestartStep={restartPipelineStep}
                  />
                </TabsContent>

                <TabsContent value="graph">
                  <KnowledgeGraph
                    nodes={pipelineResults?.nodes?.length ? pipelineResults.nodes.map(n => ({
                      id: n.id,
                      label: n.label,
                      description: n.description,
                      node_type: n.node_type,
                      source_dataset: n.source_dataset,
                      source_element_ids: n.source_element_ids,
                      color: n.color,
                      size: n.size,
                      metadata: n.metadata,
                      created_by_agent: "pipeline",
                      session_id: session.id,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                      x_position: null,
                      y_position: null,
                    })) : graphNodes}
                    edges={pipelineResults?.edges?.length ? pipelineResults.edges.map(e => ({
                      id: e.id,
                      source_node_id: e.source_node_id,
                      target_node_id: e.target_node_id,
                      edge_type: e.edge_type,
                      label: e.label,
                      weight: e.weight,
                      metadata: e.metadata,
                      created_by_agent: "pipeline",
                      session_id: session.id,
                      created_at: new Date().toISOString(),
                    })) : graphEdges}
                    currentPhase={(session as any)?.phase || "conference"}
                    dataset1Label={session.dataset_1_type}
                    dataset2Label={session.dataset_2_type}
                    onNodeClick={(nodeId) => {
                      const nodes = pipelineResults?.nodes || graphNodes;
                      toast.info(`Node: ${nodes.find(n => n.id === nodeId)?.label || nodeId}`);
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
                    cells={pipelineResults?.tesseractCells?.length ? pipelineResults.tesseractCells.map((c, idx) => ({
                      id: c.id,
                      session_id: session.id,
                      x_element_id: c.id,  // Use unique cell ID, not d1ElementIds[0]
                      x_element_label: c.conceptLabel,
                      x_element_type: "concept",
                      x_index: idx,
                      y_step: 0,
                      y_step_label: "Alignment",
                      z_polarity: c.polarity,
                      z_criticality: c.polarity > 0.5 ? "high" : c.polarity > 0 ? "medium" : "low",
                      evidence_summary: c.rationale,
                      evidence_refs: { d1ElementIds: c.d1ElementIds, d2ElementIds: c.d2ElementIds },
                      contributing_agents: ["pipeline"],
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    })) : tesseractCells}
                    currentIteration={session.current_iteration}
                    d1Elements={d1Elements}
                    d2Elements={d2Elements}
                    d1Label={d1Label || session.dataset_1_type}
                    d2Label={d2Label || session.dataset_2_type}
                    onCellClick={(cell) => {
                      toast.info(`${cell.x_element_label || cell.x_element_id}: ${cell.evidence_summary || "No evidence"}`);
                    }}
                    onDeepDive={(conceptLabel, d1Items, d2Items) => {
                      console.log("Deep Dive:", conceptLabel, d1Items.length, d2Items.length);
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
                  {/* Show FitGapResults for single-dataset mode, VennDiagramResults for comparison mode */}
                  {session.dataset_2_type === "mixed" && !session.dataset_2_ids?.length ? (
                    <FitGapResults
                      tesseractCells={pipelineResults?.tesseractCells || tesseractCells.map(c => ({
                        id: c.id,
                        conceptLabel: c.x_element_label || "",
                        conceptDescription: "",
                        polarity: c.z_polarity,
                        rationale: c.evidence_summary || "",
                      }))}
                      datasetLabel={session.dataset_1_type}
                    />
                  ) : (
                    <VennDiagramResults
                      vennResult={pipelineResults?.vennResult ? {
                        uniqueToD1: pipelineResults.vennResult.uniqueToD1,
                        aligned: pipelineResults.vennResult.aligned,
                        uniqueToD2: pipelineResults.vennResult.uniqueToD2,
                        summary: pipelineResults.vennResult.summary,
                      } : session.venn_result}
                      dataset1Label={session.dataset_1_type}
                      dataset2Label={session.dataset_2_type}
                    />
                  )}
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
