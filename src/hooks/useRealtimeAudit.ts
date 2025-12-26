import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useShareToken } from "@/hooks/useShareToken";
import { RealtimeChannel } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

type AuditSession = Database["public"]["Tables"]["audit_sessions"]["Row"];
type AuditBlackboard = Database["public"]["Tables"]["audit_blackboard"]["Row"];
type AuditTesseractCell = Database["public"]["Tables"]["audit_tesseract_cells"]["Row"];
type AuditAgentInstance = Database["public"]["Tables"]["audit_agent_instances"]["Row"];

// Type for graph nodes (from new tables)
interface AuditGraphNode {
  id: string;
  session_id: string;
  label: string;
  description: string | null;
  node_type: string;
  source_dataset: string | null;
  source_element_ids: string[];
  created_by_agent: string;
  x_position: number;
  y_position: number;
  color: string | null;
  size: number;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

// Type for graph edges (from new tables)
interface AuditGraphEdge {
  id: string;
  session_id: string;
  source_node_id: string;
  target_node_id: string;
  label: string | null;
  edge_type: string;
  weight: number;
  created_by_agent: string;
  metadata: Json;
  created_at: string;
}

// Type for activity stream
export interface AuditActivityEntry {
  id: string;
  session_id: string;
  agent_role: string | null;
  activity_type: string;
  title: string;
  content: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface UseRealtimeAuditReturn {
  session: AuditSession | null;
  blackboardEntries: AuditBlackboard[];
  tesseractCells: AuditTesseractCell[];
  agentInstances: AuditAgentInstance[];
  graphNodes: AuditGraphNode[];
  graphEdges: AuditGraphEdge[];
  activityStream: AuditActivityEntry[];
  isLoading: boolean;
  error: string | null;
  createSession: (params: CreateSessionParams) => Promise<AuditSession | null>;
  updateSessionStatus: (sessionId: string, status: string) => Promise<void>;
  writeToBlackboard: (entry: WriteBlackboardParams) => Promise<void>;
  writeTesseractCell: (cell: WriteTesseractCellParams) => Promise<void>;
  refreshSession: (sessionId: string) => Promise<void>;
}

interface CreateSessionParams {
  name: string;
  description?: string;
  dataset1Type: string;
  dataset1Ids?: string[];
  dataset2Type: string;
  dataset2Ids?: string[];
  maxIterations?: number;
  agentDefinitions?: Json;
}

interface WriteBlackboardParams {
  sessionId: string;
  agentRole: string;
  entryType: string;
  content: string;
  iteration: number;
  confidence?: number;
  evidence?: Json;
  targetAgent?: string;
}

interface WriteTesseractCellParams {
  sessionId: string;
  xIndex: number;
  xElementId: string;
  xElementType: string;
  xElementLabel?: string;
  yStep: number;
  yStepLabel?: string;
  zPolarity: number;
  zCriticality?: string;
  evidenceSummary?: string;
  evidenceRefs?: Json;
  contributingAgents?: string[];
}

export function useRealtimeAudit(projectId: string, sessionId?: string): UseRealtimeAuditReturn {
  const { token: shareToken } = useShareToken(projectId);
  const channelRef = useRef<RealtimeChannel | null>(null);
  
  const [session, setSession] = useState<AuditSession | null>(null);
  const [blackboardEntries, setBlackboardEntries] = useState<AuditBlackboard[]>([]);
  const [tesseractCells, setTesseractCells] = useState<AuditTesseractCell[]>([]);
  const [agentInstances, setAgentInstances] = useState<AuditAgentInstance[]>([]);
  const [graphNodes, setGraphNodes] = useState<AuditGraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<AuditGraphEdge[]>([]);
  const [activityStream, setActivityStream] = useState<AuditActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessionData = useCallback(async (sid: string) => {
    if (!shareToken) return;
    setIsLoading(true);
    setError(null);
    
    try {
      const { data: sessions } = await supabase.rpc("get_audit_sessions_with_token", { p_project_id: projectId, p_token: shareToken });
      const currentSession = sessions?.find((s: AuditSession) => s.id === sid);
      if (currentSession) setSession(currentSession);
      
      const { data: entries } = await supabase.rpc("get_audit_blackboard_with_token", { p_session_id: sid, p_token: shareToken });
      setBlackboardEntries(entries || []);
      
      const { data: cells } = await supabase.rpc("get_audit_tesseract_cells_with_token", { p_session_id: sid, p_token: shareToken });
      setTesseractCells(cells || []);
      
      const { data: agents } = await supabase.rpc("get_audit_agent_instances_with_token", { p_session_id: sid, p_token: shareToken });
      setAgentInstances(agents || []);

      // Load graph data
      const { data: nodes } = await supabase.rpc("get_audit_graph_nodes_with_token", { p_session_id: sid, p_token: shareToken });
      setGraphNodes((nodes as AuditGraphNode[]) || []);

      const { data: edges } = await supabase.rpc("get_audit_graph_edges_with_token", { p_session_id: sid, p_token: shareToken });
      setGraphEdges((edges as AuditGraphEdge[]) || []);

      // Load activity stream
      const { data: activities } = await supabase.rpc("get_audit_activity_stream_with_token", { p_session_id: sid, p_token: shareToken, p_limit: 200 });
      setActivityStream((activities as AuditActivityEntry[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, [projectId, shareToken]);

  useEffect(() => {
    if (!sessionId || !shareToken) return;
    loadSessionData(sessionId);
    
    const channel = supabase.channel(`audit-${sessionId}`);
    channelRef.current = channel;
    
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_sessions", filter: `id=eq.${sessionId}` }, (p) => {
        if (p.eventType === "UPDATE") setSession(p.new as AuditSession);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_blackboard", filter: `session_id=eq.${sessionId}` }, (p) => {
        setBlackboardEntries((prev) => [...prev, p.new as AuditBlackboard]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_tesseract_cells", filter: `session_id=eq.${sessionId}` }, (p) => {
        if (p.eventType === "INSERT") setTesseractCells((prev) => [...prev, p.new as AuditTesseractCell]);
        else if (p.eventType === "UPDATE") setTesseractCells((prev) => prev.map((c) => c.id === (p.new as AuditTesseractCell).id ? (p.new as AuditTesseractCell) : c));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_graph_nodes", filter: `session_id=eq.${sessionId}` }, (p) => {
        if (p.eventType === "INSERT") setGraphNodes((prev) => [...prev, p.new as AuditGraphNode]);
        else if (p.eventType === "UPDATE") setGraphNodes((prev) => prev.map((n) => n.id === (p.new as AuditGraphNode).id ? (p.new as AuditGraphNode) : n));
        else if (p.eventType === "DELETE") setGraphNodes((prev) => prev.filter((n) => n.id !== (p.old as AuditGraphNode).id));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_graph_edges", filter: `session_id=eq.${sessionId}` }, (p) => {
        if (p.eventType === "INSERT") setGraphEdges((prev) => [...prev, p.new as AuditGraphEdge]);
        else if (p.eventType === "DELETE") setGraphEdges((prev) => prev.filter((e) => e.id !== (p.old as AuditGraphEdge).id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_activity_stream", filter: `session_id=eq.${sessionId}` }, (p) => {
        setActivityStream((prev) => [...prev, p.new as AuditActivityEntry]);
      })
      .on("broadcast", { event: "audit_refresh" }, () => loadSessionData(sessionId))
      .subscribe();
    
    return () => { channel.unsubscribe(); channelRef.current = null; };
  }, [sessionId, shareToken, loadSessionData]);

  const createSession = useCallback(async (params: CreateSessionParams): Promise<AuditSession | null> => {
    if (!shareToken) return null;
    const { data, error } = await supabase.rpc("insert_audit_session_with_token", {
      p_project_id: projectId, p_token: shareToken, p_name: params.name, p_description: params.description || null,
      p_dataset_1_type: params.dataset1Type, p_dataset_1_ids: params.dataset1Ids || null,
      p_dataset_2_type: params.dataset2Type, p_dataset_2_ids: params.dataset2Ids || null,
      p_max_iterations: params.maxIterations || 10, p_agent_definitions: params.agentDefinitions || null,
    });
    if (error) { setError(error.message); return null; }
    channelRef.current?.send({ type: "broadcast", event: "audit_refresh", payload: {} });
    return data as AuditSession;
  }, [projectId, shareToken]);

  const updateSessionStatus = useCallback(async (sid: string, status: string) => {
    if (!shareToken) return;
    await supabase.rpc("update_audit_session_with_token", { p_session_id: sid, p_token: shareToken, p_status: status });
    channelRef.current?.send({ type: "broadcast", event: "audit_refresh", payload: {} });
  }, [shareToken]);

  const writeToBlackboard = useCallback(async (entry: WriteBlackboardParams) => {
    if (!shareToken) return;
    await supabase.rpc("insert_audit_blackboard_with_token", {
      p_session_id: entry.sessionId, p_token: shareToken, p_agent_role: entry.agentRole, p_entry_type: entry.entryType,
      p_content: entry.content, p_iteration: entry.iteration, p_confidence: entry.confidence || null,
      p_evidence: entry.evidence || null, p_target_agent: entry.targetAgent || null,
    });
  }, [shareToken]);

  const writeTesseractCell = useCallback(async (cell: WriteTesseractCellParams) => {
    if (!shareToken) return;
    await supabase.rpc("upsert_audit_tesseract_cell_with_token", {
      p_session_id: cell.sessionId, p_token: shareToken, p_x_index: cell.xIndex, p_x_element_id: cell.xElementId,
      p_x_element_type: cell.xElementType, p_x_element_label: cell.xElementLabel || null, p_y_step: cell.yStep,
      p_y_step_label: cell.yStepLabel || null, p_z_polarity: cell.zPolarity, p_z_criticality: cell.zCriticality || null,
      p_evidence_summary: cell.evidenceSummary || null, p_evidence_refs: cell.evidenceRefs || null,
      p_contributing_agents: cell.contributingAgents || null,
    });
  }, [shareToken]);

  const refreshSession = useCallback(async (sid: string) => { await loadSessionData(sid); }, [loadSessionData]);

  return { session, blackboardEntries, tesseractCells, agentInstances, graphNodes, graphEdges, activityStream, isLoading, error, createSession, updateSessionStatus, writeToBlackboard, writeTesseractCell, refreshSession };
}
