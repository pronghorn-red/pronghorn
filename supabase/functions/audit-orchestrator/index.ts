import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AuditRequest {
  sessionId: string;
  projectId: string;
  shareToken: string;
}

interface AgentPersona {
  role: string;
  name: string;
  systemPrompt: string;
  sectorStart?: number;
  sectorEnd?: number;
}

interface ProblemShape {
  dataset1: { type: string; count: number; elements: Array<{ id: string; label: string; index: number }> };
  dataset2: { type: string; count: number; summary: string };
  steps: Array<{ step: number; label: string }>;
}

// Parse JSON from LLM response with multiple fallback methods
function parseAgentResponse(rawText: string): any {
  const text = rawText.trim();
  console.log("Parsing agent response, length:", text.length);

  const tryParse = (jsonStr: string, method: string): any | null => {
    try {
      const parsed = JSON.parse(jsonStr);
      console.log(`JSON parsed via ${method}`);
      return parsed;
    } catch (e) {
      console.log(`Parse failed (${method}):`, (e as Error).message);
      return null;
    }
  };

  // Method 1: Direct parse
  let result = tryParse(text, "direct");
  if (result) return result;

  // Method 2: Extract from code fence
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    result = tryParse(fenceMatch[1].trim(), "code fence");
    if (result) return result;
  }

  // Method 3: Brace extraction
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    result = tryParse(text.slice(firstBrace, lastBrace + 1), "brace extraction");
    if (result) return result;
  }

  console.error("All parsing methods failed");
  return { error: "parse_failed", raw: text.slice(0, 500) };
}

// Get Grok response schema for audit agent
function getGrokAuditSchema() {
  return {
    type: "json_schema",
    json_schema: {
      name: "audit_agent_response",
      strict: true,
      schema: {
        type: "object",
        properties: {
          reasoning: { type: "string", description: "Analysis reasoning" },
          observations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                elementId: { type: "string" },
                elementLabel: { type: "string" },
                step: { type: "integer" },
                polarity: { type: "number", description: "-1 to +1" },
                criticality: { type: "string", enum: ["critical", "major", "minor", "info"] },
                evidence: { type: "string" },
              },
              required: ["elementId", "step", "polarity", "evidence"],
            },
          },
          blackboardEntry: {
            type: "object",
            properties: {
              entryType: { type: "string", enum: ["observation", "finding", "question", "thesis"] },
              content: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["entryType", "content"],
          },
          sectorComplete: { type: "boolean" },
          consensusVote: { type: ["boolean", "null"] },
        },
        required: ["reasoning", "observations", "blackboardEntry", "sectorComplete"],
      },
    },
  };
}

// Get Claude tool for audit agent
function getClaudeAuditTool() {
  return {
    name: "submit_audit_findings",
    description: "Submit your audit analysis findings. You MUST use this tool to respond.",
    input_schema: {
      type: "object",
      properties: {
        reasoning: { type: "string", description: "Analysis reasoning" },
        observations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              elementId: { type: "string" },
              elementLabel: { type: "string" },
              step: { type: "integer" },
              polarity: { type: "number" },
              criticality: { type: "string", enum: ["critical", "major", "minor", "info"] },
              evidence: { type: "string" },
            },
            required: ["elementId", "step", "polarity", "evidence"],
          },
        },
        blackboardEntry: {
          type: "object",
          properties: {
            entryType: { type: "string", enum: ["observation", "finding", "question", "thesis"] },
            content: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["entryType", "content"],
        },
        sectorComplete: { type: "boolean" },
        consensusVote: { type: ["boolean", "null"] },
      },
      required: ["reasoning", "observations", "blackboardEntry", "sectorComplete"],
    },
  };
}

// Build system prompt for an agent persona
function buildAgentSystemPrompt(persona: AgentPersona, problemShape: ProblemShape, iteration: number): string {
  const basePrompt = `You are ${persona.name}, an expert ${persona.role} performing a compliance audit.

## Your Mission
Analyze Dataset 1 (${problemShape.dataset1.type}) against Dataset 2 (${problemShape.dataset2.type}) from your specialized perspective.

## Your Assigned Sector
You are responsible for elements ${persona.sectorStart} to ${persona.sectorEnd} (indices) from Dataset 1.

## Dataset 1 Elements in Your Sector
${problemShape.dataset1.elements
  .filter((e) => e.index >= (persona.sectorStart || 0) && e.index <= (persona.sectorEnd || Infinity))
  .map((e) => `- [${e.index}] ${e.label} (ID: ${e.id})`)
  .join("\n")}

## Analysis Steps
${problemShape.steps.map((s) => `${s.step}. ${s.label}`).join("\n")}

## Your Perspective (${persona.role})
${persona.systemPrompt}

## Current Iteration: ${iteration}

## Instructions
1. For each element in your sector, analyze it through each step
2. Record polarity (-1 = gap/violation, 0 = neutral, +1 = compliant)
3. Provide evidence for each observation
4. Write a summary to the blackboard
5. Mark sectorComplete=true when you've analyzed all assigned elements
6. Vote consensusVote=true only if ALL agents have completed AND you agree the audit is done

RESPOND USING THE STRUCTURED OUTPUT FORMAT.`;

  return basePrompt;
}

// Default agent personas
const DEFAULT_PERSONAS: AgentPersona[] = [
  {
    role: "security_analyst",
    name: "Security Analyst",
    systemPrompt: "Focus on security vulnerabilities, access control gaps, data exposure risks, authentication weaknesses, and compliance with security standards.",
  },
  {
    role: "business_analyst",
    name: "Business Analyst",
    systemPrompt: "Focus on business requirement fulfillment, user story coverage, acceptance criteria validation, and business logic completeness.",
  },
  {
    role: "developer",
    name: "Developer",
    systemPrompt: "Focus on technical implementation quality, code coverage, API completeness, error handling, and architectural alignment.",
  },
  {
    role: "end_user",
    name: "End User Advocate",
    systemPrompt: "Focus on usability, accessibility, user experience flows, edge cases from user perspective, and intuitive behavior.",
  },
  {
    role: "architect",
    name: "System Architect",
    systemPrompt: "Focus on system design patterns, scalability considerations, integration points, and overall architectural coherence.",
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const { sessionId, projectId, shareToken }: AuditRequest = await req.json();
    console.log("Starting audit orchestrator:", { sessionId, projectId });

    // Set share token for RLS
    await supabase.rpc("set_share_token", { token: shareToken });

    // Get session details
    const { data: sessions, error: sessionsError } = await supabase.rpc("get_audit_sessions_with_token", {
      p_project_id: projectId,
      p_token: shareToken,
    });
    if (sessionsError) throw sessionsError;

    const session = sessions?.find((s: any) => s.id === sessionId);
    if (!session) throw new Error("Session not found");

    // Get project settings for API key
    const { data: project, error: projectError } = await supabase.rpc("get_project_with_token", {
      p_project_id: projectId,
      p_token: shareToken,
    });
    if (projectError) throw projectError;

    const selectedModel = project.selected_model || "grok-3-mini";
    let apiKey: string;
    let apiEndpoint: string;

    if (selectedModel.startsWith("gemini")) {
      apiKey = Deno.env.get("GEMINI_API_KEY")!;
      apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;
    } else if (selectedModel.startsWith("claude")) {
      apiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
      apiEndpoint = "https://api.anthropic.com/v1/messages";
    } else {
      apiKey = Deno.env.get("XAI_API_KEY")!;
      apiEndpoint = "https://api.x.ai/v1/chat/completions";
    }

    if (!apiKey) throw new Error(`API key not configured for: ${selectedModel}`);

    // Update session status to running
    await supabase.rpc("update_audit_session_with_token", {
      p_session_id: sessionId,
      p_token: shareToken,
      p_status: "analyzing_shape",
    });

    // PHASE 1: Build Problem Shape
    console.log("Building problem shape...");
    const problemShape = await buildProblemShape(supabase, session, projectId, shareToken);

    await supabase.rpc("update_audit_session_with_token", {
      p_session_id: sessionId,
      p_token: shareToken,
      p_status: "agents_active",
      p_problem_shape: problemShape,
    });

    // PHASE 2: Spawn Agent Instances
    console.log("Spawning agents...");
    const agentDefs = session.agent_definitions || {};
    const enabledPersonas = DEFAULT_PERSONAS.filter((p) => {
      const def = agentDefs[p.role];
      return !def || def.enabled !== false;
    }).map((p) => ({
      ...p,
      systemPrompt: agentDefs[p.role]?.customPrompt || p.systemPrompt,
    }));

    // Divide sectors among agents
    const elementsPerAgent = Math.ceil(problemShape.dataset1.count / enabledPersonas.length);
    const agents: AgentPersona[] = enabledPersonas.map((p, i) => ({
      ...p,
      sectorStart: i * elementsPerAgent,
      sectorEnd: Math.min((i + 1) * elementsPerAgent - 1, problemShape.dataset1.count - 1),
    }));

    // Create agent instances in DB
    for (const agent of agents) {
      await supabase.rpc("insert_audit_agent_instance_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: agent.role,
        p_agent_name: agent.name,
        p_system_prompt: agent.systemPrompt,
        p_sector_start: agent.sectorStart,
        p_sector_end: agent.sectorEnd,
      });
    }

    // Broadcast channel for real-time updates
    const channel = supabase.channel(`audit-${sessionId}`);

    // PHASE 3: Iteration Loop
    const MAX_ITERATIONS = session.max_iterations || 10;
    let iteration = 0;
    let consensusReached = false;

    while (iteration < MAX_ITERATIONS && !consensusReached) {
      iteration++;
      console.log(`=== Iteration ${iteration} ===`);

      // Update session iteration
      await supabase.rpc("update_audit_session_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_current_iteration: iteration,
      });

      // Check for abort
      const { data: currentSession } = await supabase.rpc("get_audit_sessions_with_token", {
        p_project_id: projectId,
        p_token: shareToken,
      });
      const sessionState = currentSession?.find((s: any) => s.id === sessionId);
      if (sessionState?.status === "stopped" || sessionState?.status === "paused") {
        console.log("Session stopped/paused, exiting loop");
        break;
      }

      // Get recent blackboard entries for context
      const { data: recentBlackboard } = await supabase.rpc("get_audit_blackboard_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
      });
      const blackboardContext = (recentBlackboard || [])
        .slice(-30)
        .map((e: any) => `[${e.agent_role}] ${e.entry_type}: ${e.content}`)
        .join("\n");

      // Run each agent in parallel
      const agentPromises = agents.map(async (agent) => {
        try {
          const systemPrompt = buildAgentSystemPrompt(agent, problemShape, iteration);
          const userPrompt = `## Recent Blackboard Entries\n${blackboardContext || "(empty)"}\n\nAnalyze your assigned sector and report findings.`;

          let agentResponse: any;

          if (selectedModel.startsWith("grok")) {
            const response = await fetch(apiEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: selectedModel,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: userPrompt },
                ],
                response_format: getGrokAuditSchema(),
                max_tokens: 4096,
              }),
            });
            const data = await response.json();
            agentResponse = parseAgentResponse(data.choices?.[0]?.message?.content || "{}");
          } else if (selectedModel.startsWith("claude")) {
            const response = await fetch(apiEndpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "anthropic-beta": "max-tokens-3-5-sonnet-2024-07-15",
              },
              body: JSON.stringify({
                model: selectedModel,
                max_tokens: 4096,
                system: systemPrompt,
                messages: [{ role: "user", content: userPrompt }],
                tools: [getClaudeAuditTool()],
                tool_choice: { type: "tool", name: "submit_audit_findings" },
              }),
            });
            const data = await response.json();
            const toolUse = data.content?.find((c: any) => c.type === "tool_use");
            agentResponse = toolUse?.input || parseAgentResponse(JSON.stringify(data));
          } else {
            // Gemini
            const response = await fetch(`${apiEndpoint}?key=${apiKey}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
                generationConfig: { responseMimeType: "application/json", maxOutputTokens: 4096 },
              }),
            });
            const data = await response.json();
            agentResponse = parseAgentResponse(data.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
          }

          // Process agent response
          if (agentResponse.observations) {
            for (const obs of agentResponse.observations) {
              await supabase.rpc("upsert_audit_tesseract_cell_with_token", {
                p_session_id: sessionId,
                p_token: shareToken,
                p_x_index: problemShape.dataset1.elements.findIndex((e: any) => e.id === obs.elementId),
                p_x_element_id: obs.elementId,
                p_x_element_type: problemShape.dataset1.type,
                p_x_element_label: obs.elementLabel || null,
                p_y_step: obs.step,
                p_y_step_label: problemShape.steps.find((s) => s.step === obs.step)?.label || null,
                p_z_polarity: obs.polarity,
                p_z_criticality: obs.criticality || null,
                p_evidence_summary: obs.evidence,
                p_contributing_agents: [agent.role],
              });
            }
          }

          if (agentResponse.blackboardEntry) {
            await supabase.rpc("insert_audit_blackboard_with_token", {
              p_session_id: sessionId,
              p_token: shareToken,
              p_agent_role: agent.role,
              p_entry_type: agentResponse.blackboardEntry.entryType,
              p_content: agentResponse.blackboardEntry.content,
              p_iteration: iteration,
              p_confidence: agentResponse.blackboardEntry.confidence || null,
            });
          }

          // Update agent sector complete status
          if (agentResponse.sectorComplete) {
            await supabase.rpc("update_audit_agent_sector_with_token", {
              p_agent_id: agents.find((a) => a.role === agent.role)?.role,
              p_session_id: sessionId,
              p_token: shareToken,
              p_sector_complete: true,
              p_consensus_vote: agentResponse.consensusVote || null,
            });
          }

          return { agent: agent.role, success: true, consensusVote: agentResponse.consensusVote };
        } catch (err) {
          console.error(`Agent ${agent.role} error:`, err);
          return { agent: agent.role, success: false, error: String(err) };
        }
      });

      const results = await Promise.all(agentPromises);
      console.log("Iteration results:", results);

      // Check consensus
      const votes = results.filter((r) => r.consensusVote === true);
      if (votes.length === agents.length) {
        consensusReached = true;
        console.log("Consensus reached!");
      }

      // Broadcast iteration complete
      channel.send({ type: "broadcast", event: "audit_refresh", payload: { iteration } });
    }

    // PHASE 4: Finalize Results
    console.log("Finalizing audit...");
    const vennResult = await generateVennResult(supabase, sessionId, shareToken, problemShape);

    await supabase.rpc("update_audit_session_with_token", {
      p_session_id: sessionId,
      p_token: shareToken,
      p_status: consensusReached ? "completed" : "completed_max_iterations",
      p_venn_result: vennResult,
      p_consensus_reached: consensusReached,
    });

    channel.send({ type: "broadcast", event: "audit_refresh", payload: { completed: true } });

    return new Response(JSON.stringify({ success: true, sessionId, iterations: iteration, consensusReached }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Audit orchestrator error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Build problem shape by analyzing both datasets
async function buildProblemShape(supabase: any, session: any, projectId: string, shareToken: string): Promise<ProblemShape> {
  const d1Type = session.dataset_1_type;
  const d2Type = session.dataset_2_type;

  // Get Dataset 1 elements
  let d1Elements: Array<{ id: string; label: string; index: number }> = [];
  
  if (d1Type === "requirements") {
    const { data } = await supabase.rpc("get_requirements_with_token", { p_project_id: projectId, p_token: shareToken });
    d1Elements = (data || []).map((r: any, i: number) => ({ id: r.id, label: r.title || r.text?.slice(0, 50), index: i }));
  } else if (d1Type === "canvas_nodes") {
    const { data } = await supabase.rpc("get_canvas_nodes_with_token", { p_project_id: projectId, p_token: shareToken });
    d1Elements = (data || []).map((n: any, i: number) => ({ id: n.id, label: n.data?.label || n.type, index: i }));
  } else if (d1Type === "standards") {
    const { data } = await supabase.rpc("get_project_standards_with_token", { p_project_id: projectId, p_token: shareToken });
    const stdList = Array.isArray(data) ? data : [];
    d1Elements = stdList.map((s: any, i: number) => ({ id: s.standard_id || s.id, label: s.name || s.title, index: i }));
  } else if (d1Type === "artifacts") {
    const { data } = await supabase.rpc("get_artifacts_with_token", { p_project_id: projectId, p_token: shareToken });
    d1Elements = (data || []).map((a: any, i: number) => ({ id: a.id, label: a.ai_title || a.content?.slice(0, 50), index: i }));
  }

  // Get Dataset 2 summary
  let d2Summary = "";
  let d2Count = 0;

  if (d2Type === "repository_files") {
    const { data: repos } = await supabase.rpc("get_project_repos_with_token", { p_project_id: projectId, p_token: shareToken });
    const repoList = Array.isArray(repos) ? repos : [];
    if (repoList[0]) {
      const { data: files } = await supabase.rpc("get_repo_files_with_token", { p_repo_id: repoList[0].id, p_token: shareToken });
      const fileList = Array.isArray(files) ? files : [];
      d2Count = fileList.length;
      d2Summary = `${d2Count} files in repository`;
    }
  } else if (d2Type === "requirements") {
    const { data } = await supabase.rpc("get_requirements_with_token", { p_project_id: projectId, p_token: shareToken });
    d2Count = data?.length || 0;
    d2Summary = `${d2Count} requirements`;
  } else if (d2Type === "canvas_nodes") {
    const { data } = await supabase.rpc("get_canvas_nodes_with_token", { p_project_id: projectId, p_token: shareToken });
    d2Count = data?.length || 0;
    d2Summary = `${d2Count} canvas nodes`;
  }

  // Define analysis steps
  const steps = [
    { step: 1, label: "Identification - Does D1 element appear in D2?" },
    { step: 2, label: "Completeness - Is implementation complete?" },
    { step: 3, label: "Correctness - Is implementation correct?" },
    { step: 4, label: "Quality - Does implementation meet quality standards?" },
    { step: 5, label: "Integration - Is element properly integrated?" },
  ];

  return {
    dataset1: { type: d1Type, count: d1Elements.length, elements: d1Elements },
    dataset2: { type: d2Type, count: d2Count, summary: d2Summary },
    steps,
  };
}

// Generate Venn diagram result from tesseract cells
async function generateVennResult(supabase: any, sessionId: string, shareToken: string, problemShape: ProblemShape): Promise<any> {
  const { data: cells } = await supabase.rpc("get_audit_tesseract_cells_with_token", {
    p_session_id: sessionId,
    p_token: shareToken,
  });

  if (!cells || cells.length === 0) {
    return { unique_to_d1: [], aligned: [], unique_to_d2: [], summary: { total_d1_coverage: 0, total_d2_coverage: 0, alignment_score: 0 } };
  }

  // Aggregate by element
  const elementScores = new Map<string, { totalPolarity: number; count: number; label: string; evidence: string[] }>();
  
  for (const cell of cells) {
    const existing = elementScores.get(cell.x_element_id) || { totalPolarity: 0, count: 0, label: cell.x_element_label || "", evidence: [] as string[] };
    existing.totalPolarity += cell.z_polarity;
    existing.count++;
    if (cell.evidence_summary) (existing.evidence as string[]).push(cell.evidence_summary);
    elementScores.set(cell.x_element_id, existing);
  }

  const uniqueToD1: any[] = [];
  const aligned: any[] = [];
  const uniqueToD2: any[] = [];

  for (const [id, score] of elementScores.entries()) {
    const avgPolarity = score.totalPolarity / score.count;
    const item = {
      id,
      label: score.label,
      category: avgPolarity < -0.3 ? "unique_d1" : avgPolarity > 0.3 ? "aligned" : "unique_d2",
      criticality: avgPolarity < -0.7 ? "critical" : avgPolarity < -0.3 ? "major" : avgPolarity < 0.3 ? "minor" : "info",
      evidence: score.evidence.slice(0, 3).join("; "),
    };

    if (avgPolarity < -0.3) uniqueToD1.push(item);
    else if (avgPolarity > 0.3) aligned.push(item);
    else uniqueToD2.push(item);
  }

  const totalElements = problemShape.dataset1.count;
  const coveredElements = aligned.length;

  return {
    unique_to_d1: uniqueToD1,
    aligned,
    unique_to_d2: uniqueToD2,
    summary: {
      total_d1_coverage: totalElements > 0 ? Math.round((coveredElements / totalElements) * 100) : 0,
      total_d2_coverage: 75, // Placeholder - would need D2 element tracking
      alignment_score: totalElements > 0 ? Math.round((coveredElements / totalElements) * 100) : 0,
    },
  };
}
