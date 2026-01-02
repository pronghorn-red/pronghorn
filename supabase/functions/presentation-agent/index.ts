import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PresentationRequest {
  projectId: string;
  presentationId: string;
  shareToken: string;
  mode: "concise" | "detailed";
  targetSlides: number;
  initialPrompt?: string;
}

interface BlackboardEntry {
  id: string;
  timestamp: string;
  source: string;
  category: "observation" | "insight" | "question" | "decision" | "estimate" | "analysis" | "narrative";
  content: string;
  data?: Record<string, any>;
}

interface ToolResult {
  tool: string;
  success: boolean;
  data?: any;
  error?: string;
  blackboardEntries: BlackboardEntry[];
}

interface SlideContent {
  regionId: string;
  type: string;
  data: any;
}

interface GeneratedSlide {
  id: string;
  order: number;
  layoutId: string;
  title: string;
  subtitle?: string;
  content: SlideContent[];
  notes?: string;
  imageUrl?: string;
}

// Generate unique ID
function generateId(): string {
  return crypto.randomUUID();
}

// Create SSE message
function sseMessage(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Battle-tested JSON parser from coding-agent-orchestrator
function parseAgentResponseText(rawText: string): any {
  const originalText = rawText.trim();
  let text = originalText;

  console.log("Parsing agent response, length:", rawText.length);
  console.log("Raw preview:", rawText.slice(0, 300) + (rawText.length > 300 ? "..." : ""));

  const tryParse = (jsonStr: string, method: string): any | null => {
    try {
      const parsed = JSON.parse(jsonStr);
      console.log(`JSON parsed successfully via ${method}`);
      return parsed;
    } catch (e) {
      console.log(`JSON.parse failed in ${method}:`, (e as Error).message);
      return null;
    }
  };

  // Method 1: Direct parse
  let result = tryParse(text, "direct parse");
  if (result) return result;

  // Method 2: Extract from LAST ```json fence
  const lastFenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```[\s\S]*$/i);
  if (lastFenceMatch?.[1]) {
    const extracted = lastFenceMatch[1].trim();
    const cleaned = extracted
      .replace(/^[\s\n]*here.?is.?the.?json.?[:\s]*/i, "")
      .replace(/^[\s\n]*json[:\s]*/i, "")
      .trim();
    result = tryParse(cleaned, "last code fence");
    if (result) return result;
  }

  // Method 3: Find ALL code blocks and try each (reverse order)
  const allFences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (let i = allFences.length - 1; i >= 0; i--) {
    const content = allFences[i][1].trim();
    if (content) {
      result = tryParse(content, `code fence #${i + 1} (reverse)`);
      if (result) return result;
    }
  }

  // Method 4: Brace/bracket matching (arrays for slides)
  const firstBracket = originalText.indexOf("[");
  const lastBracket = originalText.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const candidate = originalText.slice(firstBracket, lastBracket + 1);
    result = tryParse(candidate, "bracket extraction (array)");
    if (result) return result;
  }

  // Method 5: Brace matching (objects)
  const firstBrace = originalText.indexOf("{");
  const lastBrace = originalText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = originalText.slice(firstBrace, lastBrace + 1);
    result = tryParse(candidate, "brace extraction (raw)");
    if (result) return result;

    const cleaned = candidate.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    result = tryParse(cleaned, "brace extraction (cleaned)");
    if (result) return result;
  }

  console.error("All JSON parsing methods failed for response:", originalText.slice(0, 1000));
  return null;
}

// Grok structured output schema for presentation slides
function getGrokSlideSchema() {
  return {
    type: "json_schema",
    json_schema: {
      name: "presentation_slides",
      strict: true,
      schema: {
        type: "object",
        properties: {
          slides: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                order: { type: "integer" },
                layoutId: { type: "string" },
                title: { type: "string" },
                subtitle: { type: "string" },
                content: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      regionId: { type: "string" },
                      type: { type: "string" },
                      data: { type: "object" },
                    },
                    required: ["regionId", "type", "data"],
                  },
                },
                notes: { type: "string" },
              },
              required: ["id", "order", "layoutId", "title", "content"],
            },
          },
        },
        required: ["slides"],
      },
    },
  };
}

// Claude tool for structured slide output
function getClaudeSlideTool() {
  return {
    name: "generate_slides",
    description: "Generate presentation slides with structured content. You MUST use this tool to return slides.",
    input_schema: {
      type: "object",
      properties: {
        slides: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique slide ID" },
              order: { type: "integer", description: "Slide order (1-based)" },
              layoutId: {
                type: "string",
                enum: ["title-cover", "section-divider", "title-content", "two-column", "image-left", "image-right", "stats-grid", "chart-full", "table", "bullets", "quote", "architecture", "comparison", "timeline", "icon-grid"],
              },
              title: { type: "string" },
              subtitle: { type: "string" },
              content: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    regionId: { type: "string" },
                    type: { type: "string", enum: ["heading", "text", "bullets", "image", "stat", "chart", "table", "timeline", "icon-grid", "richtext"] },
                    data: { type: "object" },
                  },
                  required: ["regionId", "type", "data"],
                },
              },
              notes: { type: "string" },
            },
            required: ["id", "order", "layoutId", "title", "content"],
          },
        },
      },
      required: ["slides"],
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const authHeader = req.headers.get("authorization");
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: {
            headers: authHeader ? { Authorization: authHeader } : {},
          },
        });

        const requestData: PresentationRequest = await req.json();
        const { projectId, presentationId, shareToken, mode, targetSlides, initialPrompt } = requestData;

        console.log("Starting presentation generation:", { projectId, presentationId, mode, targetSlides });

        controller.enqueue(encoder.encode(sseMessage("status", { phase: "starting", message: "Initializing presentation agent..." })));

        // Update presentation status
        await supabase.rpc("update_presentation_with_token", {
          p_presentation_id: presentationId,
          p_token: shareToken,
          p_status: "generating",
        });

        // Get project settings for model selection
        const { data: project, error: projectError } = await supabase.rpc("get_project_with_token", {
          p_project_id: projectId,
          p_token: shareToken,
        });

        if (projectError) throw projectError;

        const selectedModel = project.selected_model || "gemini-2.5-flash";
        const maxTokens = project.max_tokens || 32768;

        console.log(`Using model: ${selectedModel}, maxTokens: ${maxTokens}`);

        // Select API key based on model
        let apiKey: string;
        let apiEndpoint: string;

        if (selectedModel.startsWith("gemini")) {
          apiKey = Deno.env.get("GEMINI_API_KEY")!;
          apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;
        } else if (selectedModel.startsWith("claude")) {
          apiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
          apiEndpoint = "https://api.anthropic.com/v1/messages";
        } else if (selectedModel.startsWith("grok")) {
          apiKey = Deno.env.get("XAI_API_KEY")!;
          apiEndpoint = "https://api.x.ai/v1/chat/completions";
        } else {
          throw new Error(`Unsupported model: ${selectedModel}`);
        }

        if (!apiKey) {
          throw new Error(`API key not configured for model: ${selectedModel}`);
        }

        const blackboard: BlackboardEntry[] = [];
        const collectedData: Record<string, any> = {};

        // Helper to add blackboard entry and stream it
        const addToBlackboard = async (entry: Omit<BlackboardEntry, "id" | "timestamp">) => {
          const fullEntry: BlackboardEntry = {
            id: generateId(),
            timestamp: new Date().toISOString(),
            ...entry,
          };
          blackboard.push(fullEntry);
          controller.enqueue(encoder.encode(sseMessage("blackboard", fullEntry)));

          await supabase.rpc("append_presentation_blackboard_with_token", {
            p_presentation_id: presentationId,
            p_token: shareToken,
            p_entry: fullEntry,
          });

          return fullEntry;
        };

        // ============ DEEP DATA COLLECTION TOOLS ============

        // Tool: Read Settings with deep analysis
        const readSettings = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_settings", message: "Analyzing project settings..." })));

          try {
            const { data: proj, error } = await supabase.rpc("get_project_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;
            collectedData.settings = proj;
            const entries: BlackboardEntry[] = [];

            // Deep observation
            entries.push(await addToBlackboard({
              source: "read_settings",
              category: "observation",
              content: `Project "${proj.name}" established on ${new Date(proj.created_at).toLocaleDateString()}. ${proj.description ? `Core purpose: ${proj.description}` : "No description provided - this may indicate early-stage planning."}`,
              data: { name: proj.name, description: proj.description, created: proj.created_at },
            }));

            if (proj.organization) {
              entries.push(await addToBlackboard({
                source: "read_settings",
                category: "observation",
                content: `Organizational context: ${proj.organization}. This provides institutional framing for stakeholder communications.`,
                data: { organization: proj.organization },
              }));
            }

            // Derive insights
            const ageInDays = Math.floor((Date.now() - new Date(proj.created_at).getTime()) / (1000 * 60 * 60 * 24));
            const maturityAssessment = ageInDays < 7 ? "nascent" : ageInDays < 30 ? "developing" : ageInDays < 90 ? "maturing" : "established";

            entries.push(await addToBlackboard({
              source: "read_settings",
              category: "insight",
              content: `Project age: ${ageInDays} days (${maturityAssessment} phase). ${maturityAssessment === "nascent" ? "Expect foundational elements still forming." : maturityAssessment === "established" ? "Should have substantial documentation and implementation." : "Active development likely ongoing."}`,
              data: { ageInDays, maturityAssessment },
            }));

            entries.push(await addToBlackboard({
              source: "read_settings",
              category: "narrative",
              content: `Opening narrative hook: "${proj.name}" ${proj.description ? `aims to ${proj.description.toLowerCase().replace(/^\w/, (c: string) => c.toLowerCase())}` : "represents a strategic initiative requiring further definition"}.`,
            }));

            return { tool: "read_settings", success: true, data: proj, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_settings", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Requirements with deep analysis
        const readRequirements = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_requirements", message: "Analyzing requirements in depth..." })));

          try {
            const { data: requirements, error } = await supabase.rpc("get_requirements_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;
            collectedData.requirements = requirements || [];
            const entries: BlackboardEntry[] = [];
            const reqs = requirements || [];

            entries.push(await addToBlackboard({
              source: "read_requirements",
              category: "observation",
              content: `Requirements corpus contains ${reqs.length} items. ${reqs.length === 0 ? "No formal requirements documented - presentation will need to focus on vision and roadmap." : `Comprehensive requirements provide solid foundation for detailed analysis.`}`,
              data: { count: reqs.length },
            }));

            if (reqs.length > 0) {
              const topLevel = reqs.filter((r: any) => !r.parent_id);
              const nested = reqs.filter((r: any) => r.parent_id);
              const decompositionRatio = nested.length / Math.max(topLevel.length, 1);

              entries.push(await addToBlackboard({
                source: "read_requirements",
                category: "analysis",
                content: `Requirements structure analysis: ${topLevel.length} top-level requirements with ${nested.length} child items. Decomposition ratio: ${decompositionRatio.toFixed(1)}x. ${decompositionRatio > 3 ? "Well-decomposed requirements indicate mature planning." : decompositionRatio > 1 ? "Moderate decomposition suggests ongoing refinement." : "Flat structure may benefit from further breakdown."}`,
                data: { topLevel: topLevel.length, nested: nested.length, decompositionRatio },
              }));

              // Analyze by category/priority if available
              const categories: Record<string, number> = {};
              const priorities: Record<string, number> = {};
              topLevel.forEach((r: any) => {
                if (r.category) categories[r.category] = (categories[r.category] || 0) + 1;
                if (r.priority) priorities[r.priority] = (priorities[r.priority] || 0) + 1;
              });

              if (Object.keys(categories).length > 0) {
                entries.push(await addToBlackboard({
                  source: "read_requirements",
                  category: "insight",
                  content: `Requirements span ${Object.keys(categories).length} categories: ${Object.entries(categories).map(([k, v]) => `${k} (${v})`).join(", ")}. This distribution reveals project focus areas.`,
                  data: { categories },
                }));
              }

              // Extract key requirements for narrative
              const keyReqs = topLevel.slice(0, 8).map((r: any) => ({
                title: r.title,
                code: r.code,
                content: r.content?.slice(0, 200),
              }));

              entries.push(await addToBlackboard({
                source: "read_requirements",
                category: "narrative",
                content: `Key requirements to highlight: ${keyReqs.map((r: any) => r.code ? `${r.code}: ${r.title}` : r.title).join("; ")}. These form the core value proposition.`,
                data: { keyRequirements: keyReqs },
              }));

              // Detailed content analysis for each major requirement
              for (const req of topLevel.slice(0, 5)) {
                if (req.content && req.content.length > 50) {
                  entries.push(await addToBlackboard({
                    source: "read_requirements",
                    category: "insight",
                    content: `${req.code || req.title}: ${req.content.slice(0, 300)}${req.content.length > 300 ? "..." : ""}`,
                    data: { requirementId: req.id, title: req.title },
                  }));
                }
              }
            }

            return { tool: "read_requirements", success: true, data: requirements, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_requirements", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Artifacts with deep analysis
        const readArtifacts = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_artifacts", message: "Analyzing artifacts and documentation..." })));

          try {
            const { data: artifacts, error } = await supabase.rpc("get_artifacts_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;
            collectedData.artifacts = artifacts || [];
            const entries: BlackboardEntry[] = [];
            const arts = artifacts || [];

            entries.push(await addToBlackboard({
              source: "read_artifacts",
              category: "observation",
              content: `Documentation inventory: ${arts.length} artifacts. ${arts.length === 0 ? "No supporting documentation found - presentation must synthesize from other sources." : "Rich documentation provides narrative material."}`,
              data: { count: arts.length },
            }));

            if (arts.length > 0) {
              const withImages = arts.filter((a: any) => a.image_url);
              const withSummaries = arts.filter((a: any) => a.ai_summary);
              const withTitles = arts.filter((a: any) => a.ai_title);

              entries.push(await addToBlackboard({
                source: "read_artifacts",
                category: "observation",
                content: `Artifact composition: ${withImages.length} include images (visual assets for slides), ${withSummaries.length} have AI summaries (pre-analyzed content), ${withTitles.length} have titles.`,
                data: { images: withImages.length, summaries: withSummaries.length, titled: withTitles.length },
              }));

              // Collect image URLs for potential use
              if (withImages.length > 0) {
                const imageAssets = withImages.slice(0, 10).map((a: any) => ({
                  url: a.image_url,
                  title: a.ai_title || "Untitled",
                }));
                entries.push(await addToBlackboard({
                  source: "read_artifacts",
                  category: "decision",
                  content: `Available visual assets for presentation: ${imageAssets.map((i: any) => i.title).join(", ")}. These can enhance slide visual impact.`,
                  data: { imageAssets },
                }));
              }

              // Analyze content themes
              for (const art of arts.slice(0, 5)) {
                if (art.ai_summary) {
                  entries.push(await addToBlackboard({
                    source: "read_artifacts",
                    category: "insight",
                    content: `${art.ai_title || "Document"}: ${art.ai_summary}`,
                    data: { artifactId: art.id, title: art.ai_title },
                  }));
                } else if (art.content && art.content.length > 100) {
                  const excerpt = art.content.slice(0, 400);
                  entries.push(await addToBlackboard({
                    source: "read_artifacts",
                    category: "observation",
                    content: `${art.ai_title || "Untitled artifact"}: ${excerpt}${art.content.length > 400 ? "..." : ""}`,
                    data: { artifactId: art.id },
                  }));
                }
              }
            }

            return { tool: "read_artifacts", success: true, data: artifacts, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_artifacts", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Canvas with deep architectural analysis
        const readCanvas = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_canvas", message: "Analyzing system architecture..." })));

          try {
            const { data: nodes, error: nodesError } = await supabase.rpc("get_canvas_nodes_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            const { data: edges, error: edgesError } = await supabase.rpc("get_canvas_edges_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (nodesError) throw nodesError;
            if (edgesError) throw edgesError;

            collectedData.canvas = { nodes: nodes || [], edges: edges || [] };
            const entries: BlackboardEntry[] = [];
            const nodeList = nodes || [];
            const edgeList = edges || [];

            entries.push(await addToBlackboard({
              source: "read_canvas",
              category: "observation",
              content: `Architecture canvas contains ${nodeList.length} components and ${edgeList.length} connections. ${nodeList.length === 0 ? "No architecture diagram exists - technical overview will be limited." : "Visual architecture available for presentation."}`,
              data: { nodes: nodeList.length, edges: edgeList.length },
            }));

            if (nodeList.length > 0) {
              // Analyze component types
              const typeGroups: Record<string, any[]> = {};
              nodeList.forEach((n: any) => {
                const type = n.type || "unknown";
                if (!typeGroups[type]) typeGroups[type] = [];
                typeGroups[type].push(n);
              });

              const typeSummary = Object.entries(typeGroups)
                .map(([t, items]) => `${items.length} ${t}${items.length > 1 ? "s" : ""}`)
                .join(", ");

              entries.push(await addToBlackboard({
                source: "read_canvas",
                category: "analysis",
                content: `Architecture composition: ${typeSummary}. This reveals the system's structural paradigm.`,
                data: { nodeTypes: Object.fromEntries(Object.entries(typeGroups).map(([k, v]) => [k, v.length])) },
              }));

              // Analyze connectivity patterns
              if (edgeList.length > 0) {
                const connectivity = edgeList.length / nodeList.length;
                const inDegree: Record<string, number> = {};
                const outDegree: Record<string, number> = {};

                edgeList.forEach((e: any) => {
                  outDegree[e.source_id] = (outDegree[e.source_id] || 0) + 1;
                  inDegree[e.target_id] = (inDegree[e.target_id] || 0) + 1;
                });

                const maxInDegree = Math.max(...Object.values(inDegree), 0);
                const maxOutDegree = Math.max(...Object.values(outDegree), 0);

                entries.push(await addToBlackboard({
                  source: "read_canvas",
                  category: "insight",
                  content: `Connectivity analysis: ${connectivity.toFixed(2)} connections per component. ${connectivity > 2 ? "Highly interconnected system suggests complex integration." : connectivity > 1 ? "Moderate coupling indicates balanced architecture." : "Loosely coupled - may indicate modular design or incomplete modeling."}`,
                  data: { connectivity, maxInDegree, maxOutDegree },
                }));
              }

              // Extract component details for narrative
              const componentDetails = nodeList.slice(0, 10).map((n: any) => ({
                type: n.type,
                label: n.data?.label || n.data?.title || "Unnamed",
                description: n.data?.description || n.data?.content?.slice(0, 100),
              }));

              entries.push(await addToBlackboard({
                source: "read_canvas",
                category: "narrative",
                content: `Key architectural components: ${componentDetails.map((c: any) => `${c.label} (${c.type})`).join(", ")}. These form the system's backbone.`,
                data: { components: componentDetails },
              }));
            }

            return { tool: "read_canvas", success: true, data: { nodes, edges }, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_canvas", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Specifications
        const readSpecifications = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_specifications", message: "Reviewing technical specifications..." })));

          try {
            const { data: specs, error } = await supabase.rpc("get_project_specifications_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;
            collectedData.specifications = specs || [];
            const entries: BlackboardEntry[] = [];
            const specList = specs || [];

            entries.push(await addToBlackboard({
              source: "read_specifications",
              category: "observation",
              content: `${specList.length} generated specification(s) available. ${specList.length === 0 ? "No formal specs generated yet." : "Technical depth available for detailed slides."}`,
              data: { count: specList.length },
            }));

            if (specList.length > 0) {
              const specTypes = specList.map((s: any) => s.agent_title).filter(Boolean);
              entries.push(await addToBlackboard({
                source: "read_specifications",
                category: "insight",
                content: `Specification coverage: ${specTypes.join(", ")}. These provide technical depth for architecture and implementation sections.`,
                data: { specTypes },
              }));

              // Extract key content from specifications
              for (const spec of specList.slice(0, 3)) {
                if (spec.generated_spec) {
                  const excerpt = spec.generated_spec.slice(0, 500);
                  entries.push(await addToBlackboard({
                    source: "read_specifications",
                    category: "narrative",
                    content: `${spec.agent_title || "Specification"} excerpt: ${excerpt}${spec.generated_spec.length > 500 ? "..." : ""}`,
                    data: { specId: spec.id },
                  }));
                }
              }
            }

            return { tool: "read_specifications", success: true, data: specs, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_specifications", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Repository Structure
        const readRepoStructure = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_repo_structure", message: "Analyzing codebase structure..." })));

          try {
            const { data: repos, error: reposError } = await supabase.rpc("get_project_repos_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (reposError) throw reposError;

            const entries: BlackboardEntry[] = [];
            let allFiles: any[] = [];

            for (const repo of (repos || [])) {
              const { data: files } = await supabase.rpc("get_repo_files_with_token", {
                p_repo_id: repo.id,
                p_token: shareToken,
              });
              if (files) {
                allFiles = allFiles.concat(files.map((f: any) => ({ ...f, repo: repo.repo })));
              }
            }

            collectedData.repoStructure = { repos: repos || [], files: allFiles };

            entries.push(await addToBlackboard({
              source: "read_repo_structure",
              category: "observation",
              content: `Codebase inventory: ${repos?.length || 0} repositories containing ${allFiles.length} files. ${allFiles.length === 0 ? "No code committed yet - project in planning phase." : "Active development with trackable progress."}`,
              data: { repoCount: repos?.length || 0, fileCount: allFiles.length },
            }));

            if (allFiles.length > 0) {
              // Analyze directory structure
              const dirs = new Set(allFiles.map((f: any) => f.path.split("/").slice(0, -1).join("/")));
              const extensions: Record<string, number> = {};
              allFiles.forEach((f: any) => {
                const ext = f.path.split(".").pop() || "no-ext";
                extensions[ext] = (extensions[ext] || 0) + 1;
              });

              const sortedExts = Object.entries(extensions)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

              entries.push(await addToBlackboard({
                source: "read_repo_structure",
                category: "analysis",
                content: `Code organization: ${dirs.size} directories. Primary languages/formats: ${sortedExts.map(([e, c]) => `${e} (${c} files)`).join(", ")}. This indicates technology choices and project scope.`,
                data: { directories: dirs.size, extensions },
              }));

              // Framework detection
              const hasPackageJson = allFiles.some((f: any) => f.path === "package.json");
              const hasRequirements = allFiles.some((f: any) => f.path === "requirements.txt");
              const hasSrc = allFiles.some((f: any) => f.path.startsWith("src/"));
              const hasComponents = allFiles.some((f: any) => f.path.includes("/components/"));
              const hasTests = allFiles.some((f: any) => f.path.includes("test") || f.path.includes("spec"));

              const techIndicators = [
                hasPackageJson && "Node.js/JavaScript",
                hasRequirements && "Python",
                hasComponents && "Component-based UI",
                hasTests && "Test coverage",
              ].filter(Boolean);

              entries.push(await addToBlackboard({
                source: "read_repo_structure",
                category: "insight",
                content: `Technology stack indicators: ${techIndicators.join(", ") || "Technology stack not clearly identifiable from file structure"}. ${hasSrc ? "Standard src/ organization." : ""} ${hasTests ? "Testing infrastructure in place." : "No visible test infrastructure."}`,
                data: { hasPackageJson, hasRequirements, hasSrc, hasComponents, hasTests },
              }));

              // Lines of code estimate
              const codeFiles = allFiles.filter((f: any) => 
                ["ts", "tsx", "js", "jsx", "py", "java", "go", "rs", "cpp", "c", "cs"].includes(f.path.split(".").pop() || "")
              );
              entries.push(await addToBlackboard({
                source: "read_repo_structure",
                category: "estimate",
                content: `Source code files: ${codeFiles.length} code files detected across ${sortedExts[0]?.[0] || "various"} and related languages. Implementation effort is ${codeFiles.length < 20 ? "early stage" : codeFiles.length < 100 ? "moderate" : "substantial"}.`,
                data: { codeFileCount: codeFiles.length },
              }));
            }

            return { tool: "read_repo_structure", success: true, data: { repos, files: allFiles }, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_repo_structure", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Databases
        const readDatabases = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_databases", message: "Analyzing database architecture..." })));

          try {
            const { data: databases, error } = await supabase.rpc("get_project_databases_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;
            collectedData.databases = databases || [];
            const entries: BlackboardEntry[] = [];
            const dbs = databases || [];

            entries.push(await addToBlackboard({
              source: "read_databases",
              category: "observation",
              content: `Database infrastructure: ${dbs.length} database(s) configured. ${dbs.length === 0 ? "No database provisioned - data persistence strategy unclear." : "Data tier established."}`,
              data: { count: dbs.length },
            }));

            if (dbs.length > 0) {
              const providers = [...new Set(dbs.map((d: any) => d.provider))];
              const statuses = dbs.map((d: any) => ({ name: d.name, status: d.status, provider: d.provider }));

              entries.push(await addToBlackboard({
                source: "read_databases",
                category: "insight",
                content: `Database providers: ${providers.join(", ")}. Status breakdown: ${statuses.map((s: any) => `${s.name} (${s.provider}): ${s.status}`).join("; ")}. ${statuses.some((s: any) => s.status === "active" || s.status === "running") ? "Active databases support runtime operations." : "Database deployment may be pending."}`,
                data: { providers, statuses },
              }));
            }

            return { tool: "read_databases", success: true, data: databases, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_databases", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read External Connections
        const readConnections = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_connections", message: "Checking external integrations..." })));

          try {
            const { data: connections, error } = await supabase.rpc("get_db_connections_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;
            collectedData.connections = connections || [];
            const entries: BlackboardEntry[] = [];
            const conns = connections || [];

            entries.push(await addToBlackboard({
              source: "read_connections",
              category: "observation",
              content: `External integrations: ${conns.length} connection(s). ${conns.length === 0 ? "No external data sources connected." : "Third-party data integrations configured."}`,
              data: { count: conns.length },
            }));

            if (conns.length > 0) {
              const connectionNames = conns.map((c: any) => c.name);
              entries.push(await addToBlackboard({
                source: "read_connections",
                category: "insight",
                content: `Connected systems: ${connectionNames.join(", ")}. These integrations extend the project's data ecosystem.`,
                data: { connectionNames },
              }));
            }

            return { tool: "read_connections", success: true, data: connections, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_connections", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Deployments
        const readDeployments = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_deployments", message: "Reviewing deployment status..." })));

          try {
            const { data: deployments, error } = await supabase.rpc("get_deployments_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;
            collectedData.deployments = deployments || [];
            const entries: BlackboardEntry[] = [];
            const deps = deployments || [];

            entries.push(await addToBlackboard({
              source: "read_deployments",
              category: "observation",
              content: `Deployment configurations: ${deps.length}. ${deps.length === 0 ? "No deployments configured - project not yet production-ready." : "Deployment infrastructure established."}`,
              data: { count: deps.length },
            }));

            if (deps.length > 0) {
              const live = deps.filter((d: any) => d.status === "deployed" || d.status === "live" || d.status === "running");
              const platforms = [...new Set(deps.map((d: any) => d.platform))];
              const environments = [...new Set(deps.map((d: any) => d.environment))];

              entries.push(await addToBlackboard({
                source: "read_deployments",
                category: "insight",
                content: `Deployment landscape: ${live.length}/${deps.length} active deployments across ${platforms.join(", ")}. Environments: ${environments.join(", ")}. ${live.length > 0 ? "Production presence established." : "Deployments configured but not yet live."}`,
                data: { liveCount: live.length, platforms, environments },
              }));

              const liveUrls = deps.filter((d: any) => d.url && (d.status === "deployed" || d.status === "live"));
              if (liveUrls.length > 0) {
                entries.push(await addToBlackboard({
                  source: "read_deployments",
                  category: "decision",
                  content: `Live URLs for demonstration: ${liveUrls.map((d: any) => `${d.name}: ${d.url}`).join("; ")}. These can be referenced in presentation materials.`,
                  data: { liveUrls: liveUrls.map((d: any) => ({ name: d.name, url: d.url })) },
                }));
              }
            }

            return { tool: "read_deployments", success: true, data: deployments, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_deployments", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // ============ EXECUTE DATA COLLECTION ============
        const toolResults: ToolResult[] = [];

        toolResults.push(await readSettings());
        toolResults.push(await readRequirements());
        toolResults.push(await readArtifacts());
        toolResults.push(await readSpecifications());
        toolResults.push(await readCanvas());
        toolResults.push(await readRepoStructure());
        toolResults.push(await readDatabases());
        toolResults.push(await readConnections());
        toolResults.push(await readDeployments());

        // ============ SYNTHESIS PHASE ============
        controller.enqueue(encoder.encode(sseMessage("status", { phase: "synthesis", message: "Synthesizing insights and building narrative..." })));

        const reqCount = collectedData.requirements?.length || 0;
        const nodeCount = collectedData.canvas?.nodes?.length || 0;
        const fileCount = collectedData.repoStructure?.files?.length || 0;
        const specCount = collectedData.specifications?.length || 0;
        const artifactCount = collectedData.artifacts?.length || 0;
        const dbCount = collectedData.databases?.length || 0;
        const deployCount = collectedData.deployments?.length || 0;

        const completionScore = Math.min(100, Math.round(
          (reqCount > 0 ? 15 : 0) +
          (nodeCount > 0 ? 20 : 0) +
          (fileCount > 0 ? 25 : 0) +
          (specCount > 0 ? 15 : 0) +
          (artifactCount > 0 ? 10 : 0) +
          (dbCount > 0 ? 8 : 0) +
          (deployCount > 0 ? 7 : 0)
        ));

        await addToBlackboard({
          source: "synthesis",
          category: "estimate",
          content: `Project maturity assessment: ${completionScore}% complete. ${completionScore < 30 ? "Early stage - focus on vision and roadmap." : completionScore < 60 ? "Mid-development - balance current state with future plans." : completionScore < 85 ? "Advanced - emphasize achievements and remaining work." : "Near-complete - highlight results and impact."}`,
          data: {
            completionScore,
            breakdown: { requirements: reqCount, architecture: nodeCount, code: fileCount, specs: specCount, artifacts: artifactCount, databases: dbCount, deployments: deployCount },
          },
        });

        // Generate executive summary
        const projectName = collectedData.settings?.name || "Project";
        const projectDesc = collectedData.settings?.description || "";
        await addToBlackboard({
          source: "synthesis",
          category: "narrative",
          content: `Executive Summary (BLUF): ${projectName} ${projectDesc ? `- ${projectDesc}` : ""}. Current status: ${completionScore}% complete with ${reqCount} requirements defined, ${nodeCount} architectural components designed, and ${fileCount} code files implemented.${deployCount > 0 ? ` ${deployCount} deployment(s) configured.` : ""}`,
          data: { type: "bluf" },
        });

        // ============ SLIDE GENERATION WITH LLM ============
        controller.enqueue(encoder.encode(sseMessage("status", { phase: "generating_slides", message: "Generating rich slide content with AI..." })));

        // Prepare comprehensive blackboard summary
        const blackboardSummary = blackboard.map(e => `[${e.category.toUpperCase()}/${e.source}] ${e.content}`).join("\n\n");

        // Get image URLs from artifacts
        const availableImages = (collectedData.artifacts || [])
          .filter((a: any) => a.image_url)
          .slice(0, 10)
          .map((a: any) => ({ url: a.image_url, title: a.ai_title || "Image" }));

        const slideGenerationPrompt = `You are creating a professional ${mode} presentation with approximately ${targetSlides} slides.

## PROJECT DATA
Project Name: ${collectedData.settings?.name || "Untitled Project"}
Description: ${collectedData.settings?.description || "No description provided"}
Organization: ${collectedData.settings?.organization || "N/A"}

### Statistics
- Requirements: ${reqCount} total
- Architecture Components: ${nodeCount}
- Code Files: ${fileCount}
- Specifications: ${specCount}
- Artifacts: ${artifactCount}
- Databases: ${dbCount}
- Deployments: ${deployCount}
- Completion Estimate: ${completionScore}%

### Key Requirements (if available)
${(collectedData.requirements || []).filter((r: any) => !r.parent_id).slice(0, 10).map((r: any) => `- ${r.code || ""} ${r.title}: ${(r.content || "").slice(0, 150)}`).join("\n")}

### Architecture Components
${(collectedData.canvas?.nodes || []).slice(0, 15).map((n: any) => `- ${n.type}: ${n.data?.label || n.data?.title || "Unnamed"}`).join("\n")}

### Available Images for Slides
${availableImages.map((i: any) => `- ${i.title}: ${i.url}`).join("\n") || "No images available"}

## BLACKBOARD INSIGHTS (Your Analysis)
${blackboardSummary}

${initialPrompt ? `## USER'S CUSTOM FOCUS\n${initialPrompt}\n` : ""}

## INSTRUCTIONS
Generate a ${mode === "concise" ? "10-15" : "20-30"} slide presentation following the structure below. Each slide MUST have:
- id: unique UUID string
- order: slide number (1-based)
- layoutId: one of the available layouts
- title: compelling, descriptive title
- subtitle: optional supporting text
- content: array of content blocks with regionId, type, and data
- notes: speaker notes explaining key points

### Available Layouts and Their Region IDs
CRITICAL: You MUST use the EXACT regionId listed for each layout. Do NOT use "main" or any other generic ID.

- "title-cover": regions=[background(image), title(heading), subtitle(text), date(text)]
- "section-divider": regions=[section-number(heading), title(heading), subtitle(text)]
- "title-content": regions=[title(heading), content(text/bullets/richtext)]
- "two-column": regions=[title(heading), left-content(richtext), right-content(richtext)]
- "image-left": regions=[title(heading), image(image), content(richtext)]
- "image-right": regions=[title(heading), content(richtext), image(image)]
- "stats-grid": regions=[title(heading), stat-1(stat), stat-2(stat), stat-3(stat), stat-4(stat)]
- "bullets": regions=[title(heading), bullets(bullets)]
- "quote": regions=[quote(text), attribution(text)]
- "architecture": regions=[title(heading), diagram(image)]
- "comparison": regions=[title(heading), left-header(heading), right-header(heading), left-content(bullets), right-content(bullets)]
- "timeline": regions=[title(heading), timeline(timeline)]
- "icon-grid": regions=[title(heading), subtitle(text), grid(icon-grid)]

### Region ID Examples
For "bullets" layout: { regionId: "bullets", type: "bullets", data: {...} }
For "stats-grid" layout: { regionId: "stat-1", type: "stat", data: {...} }, { regionId: "stat-2", ... }
For "title-content" layout: { regionId: "content", type: "richtext", data: {...} }
For "timeline" layout: { regionId: "timeline", type: "timeline", data: {...} }
For "icon-grid" layout: { regionId: "grid", type: "icon-grid", data: {...} }

### Content Block Types (ALL text MUST use MARKDOWN, NEVER HTML tags)
CRITICAL: NEVER use HTML tags like <b>, <ul>, <li>, </b>, <strong>, <p>, <br>, etc.
Use ONLY markdown: **bold**, *italic*. For lists use "bullets" type.

- "heading": { text: string (markdown OK), level: 1|2|3 }
- "text": { text: string (use **bold** and *italic*) }
- "richtext": { text: string (full markdown) }
- "bullets": { items: [{ title: string, description: string, icon?: string }] }
- "stat": { value: string, label: string, change?: string }
- "image": { url: string, alt: string }
- "timeline": { steps: [{ title: string, description: string }] }
- "icon-grid": { items: [{ icon: string, title: string, description: string }] }

FORBIDDEN: <b>, </b>, <i>, <ul>, <li>, <p>, <br>, <strong>, <em>, <div>, <span>

### Required Slide Sequence
1. COVER: Title slide with project name, tagline, date
2. EXECUTIVE SUMMARY: Bottom-line-up-front key takeaways
3. OVERVIEW: Project purpose, scope, objectives
4. REQUIREMENTS: Key requirements summary with bullets
5. ARCHITECTURE: System design with components
6. TECHNOLOGY: Tech stack with icon grid
7. STATUS: Current metrics with stats grid
8. CHALLENGES: Risks and blockers
9. OPPORTUNITIES: Growth areas
10. NEXT STEPS: Roadmap with timeline

For detailed mode, add section dividers and expand each topic.

### Content Guidelines
- Each bullet should have BOTH title AND description (2-3 sentences)
- Stats should show real numbers from the project
- Use available image URLs where appropriate
- Speaker notes should be 2-3 sentences explaining what to emphasize
- Make content specific to THIS project, not generic

Return ONLY a JSON object with a "slides" array. No markdown, no explanation.`;

        // Call LLM based on selected model
        let llmResponse: Response;
        let slidesJson: GeneratedSlide[] = [];

        try {
          if (selectedModel.startsWith("gemini")) {
            console.log("Calling Gemini API for slide generation...");
            llmResponse = await fetch(`${apiEndpoint}?key=${apiKey}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                systemInstruction: {
                  parts: [{ text: "You are a professional presentation designer. Generate structured JSON slide content with rich, detailed information. Always respond with valid JSON only." }],
                },
                contents: [{ role: "user", parts: [{ text: slideGenerationPrompt }] }],
                generationConfig: {
                  maxOutputTokens: maxTokens,
                  temperature: 0.7,
                  responseMimeType: "application/json",
                },
              }),
            });
          } else if (selectedModel.startsWith("claude")) {
            console.log("Calling Claude API with strict tool use...");
            llmResponse = await fetch(apiEndpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "anthropic-beta": "structured-outputs-2025-11-13",
              },
              body: JSON.stringify({
                model: selectedModel,
                max_tokens: maxTokens,
                system: "You are a professional presentation designer. Generate structured slide content with rich, detailed information.",
                messages: [{ role: "user", content: slideGenerationPrompt }],
                tools: [getClaudeSlideTool()],
                tool_choice: { type: "tool", name: "generate_slides" },
              }),
            });
          } else if (selectedModel.startsWith("grok")) {
            console.log("Calling Grok API with structured output...");
            llmResponse = await fetch(apiEndpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: selectedModel,
                messages: [
                  { role: "system", content: "You are a professional presentation designer. Generate structured JSON slide content with rich, detailed information." },
                  { role: "user", content: slideGenerationPrompt },
                ],
                max_tokens: maxTokens,
                temperature: 0.7,
                response_format: getGrokSlideSchema(),
              }),
            });
          } else {
            throw new Error(`Unsupported model: ${selectedModel}`);
          }

          if (!llmResponse.ok) {
            const errorText = await llmResponse.text();
            console.error("LLM API error:", llmResponse.status, errorText);
            throw new Error(`LLM API error: ${llmResponse.status} - ${errorText}`);
          }

          const llmData = await llmResponse.json();
          console.log("LLM response received");

          // Parse response based on model
          let parsedResult: any;

          if (selectedModel.startsWith("gemini")) {
            const text = llmData.candidates?.[0]?.content?.parts?.[0]?.text || "";
            parsedResult = parseAgentResponseText(text);
          } else if (selectedModel.startsWith("claude")) {
            const toolUseBlock = llmData.content?.find((block: any) => block.type === "tool_use");
            if (toolUseBlock?.input) {
              parsedResult = toolUseBlock.input;
              console.log("Claude tool use response parsed directly");
            } else {
              const textBlock = llmData.content?.find((block: any) => block.type === "text");
              const text = textBlock?.text || JSON.stringify(llmData.content);
              parsedResult = parseAgentResponseText(text);
            }
          } else if (selectedModel.startsWith("grok")) {
            const text = llmData.choices?.[0]?.message?.content || "";
            parsedResult = parseAgentResponseText(text);
          }

          // Extract slides array
          if (Array.isArray(parsedResult)) {
            slidesJson = parsedResult;
          } else if (parsedResult?.slides && Array.isArray(parsedResult.slides)) {
            slidesJson = parsedResult.slides;
          } else {
            console.error("Failed to extract slides from LLM response:", parsedResult);
            throw new Error("Invalid slides format from LLM");
          }

          console.log(`Generated ${slidesJson.length} slides`);

        } catch (llmError: any) {
          console.error("LLM slide generation failed:", llmError);

          // Fallback to basic slides
          slidesJson = [
            {
              id: generateId(),
              order: 1,
              layoutId: "title-cover",
              title: collectedData.settings?.name || "Project Presentation",
              subtitle: collectedData.settings?.description || "Generated presentation",
              content: [
                { regionId: "title", type: "heading", data: { text: collectedData.settings?.name || "Project Presentation", level: 1 } },
                { regionId: "subtitle", type: "text", data: { text: collectedData.settings?.description || "" } },
                { regionId: "date", type: "text", data: { text: new Date().toLocaleDateString() } },
              ],
              notes: "Welcome slide - introduce the project and set context",
            },
            {
              id: generateId(),
              order: 2,
              layoutId: "quote",
              title: "Executive Summary",
              content: [
                { regionId: "quote", type: "text", data: { text: `Project ${completionScore}% complete with ${reqCount} requirements, ${nodeCount} architecture components, and ${fileCount} code files.` } },
              ],
              notes: "Bottom-line-up-front summary for executives",
            },
            {
              id: generateId(),
              order: 3,
              layoutId: "stats-grid",
              title: "Project Status",
              content: [
                { regionId: "stat-1", type: "stat", data: { value: String(reqCount), label: "Requirements" } },
                { regionId: "stat-2", type: "stat", data: { value: String(nodeCount), label: "Components" } },
                { regionId: "stat-3", type: "stat", data: { value: String(fileCount), label: "Code Files" } },
                { regionId: "stat-4", type: "stat", data: { value: `${completionScore}%`, label: "Complete" } },
              ],
              notes: "Key metrics at a glance",
            },
            {
              id: generateId(),
              order: 4,
              layoutId: "bullets",
              title: "Key Insights",
              content: [
                {
                  regionId: "bullets",
                  type: "bullets",
                  data: {
                    items: blackboard
                      .filter(e => e.category === "insight" || e.category === "narrative")
                      .slice(0, 6)
                      .map(e => ({ title: e.source, description: e.content })),
                  },
                },
              ],
              notes: "Highlights from blackboard analysis",
            },
          ];

          await addToBlackboard({
            source: "synthesis",
            category: "decision",
            content: `LLM slide generation failed (${llmError.message}). Generated ${slidesJson.length} fallback slides with key data.`,
            data: { error: llmError.message, fallbackSlideCount: slidesJson.length },
          });
        }

        // Stream each generated slide
        for (const slide of slidesJson) {
          controller.enqueue(encoder.encode(sseMessage("slide", slide)));
        }

        // ============ SAVE FINAL PRESENTATION ============
        controller.enqueue(encoder.encode(sseMessage("status", { phase: "saving", message: "Saving presentation..." })));

        const metadata = {
          generatedAt: new Date().toISOString(),
          model: selectedModel,
          mode,
          targetSlides,
          actualSlides: slidesJson.length,
          blackboardEntries: blackboard.length,
          dataStats: {
            requirements: reqCount,
            artifacts: artifactCount,
            canvasNodes: nodeCount,
            specifications: specCount,
            codeFiles: fileCount,
            databases: dbCount,
            deployments: deployCount,
          },
          completionEstimate: completionScore,
        };

        await supabase.rpc("update_presentation_with_token", {
          p_presentation_id: presentationId,
          p_token: shareToken,
          p_slides: slidesJson,
          p_metadata: metadata,
          p_status: "completed",
        });

        controller.enqueue(encoder.encode(sseMessage("complete", {
          presentationId,
          slideCount: slidesJson.length,
          blackboardCount: blackboard.length,
          model: selectedModel,
        })));

        controller.close();
      } catch (error: any) {
        console.error("Presentation agent error:", error);
        controller.enqueue(encoder.encode(sseMessage("error", { message: error.message })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
