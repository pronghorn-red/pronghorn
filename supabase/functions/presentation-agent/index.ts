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
  category: "observation" | "insight" | "question" | "decision" | "estimate";
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

// Generate unique ID
function generateId(): string {
  return crypto.randomUUID();
}

// Create SSE message
function sseMessage(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const encoder = new TextEncoder();
  
  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const authHeader = req.headers.get("authorization");
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const geminiApiKey = Deno.env.get("GEMINI_API_KEY")!;

        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: {
            headers: authHeader ? { Authorization: authHeader } : {},
          },
        });

        const requestData: PresentationRequest = await req.json();
        const { projectId, presentationId, shareToken, mode, targetSlides, initialPrompt } = requestData;

        console.log("Starting presentation generation:", { projectId, presentationId, mode, targetSlides });

        // Send initial status
        controller.enqueue(encoder.encode(sseMessage("status", { phase: "starting", message: "Initializing presentation agent..." })));

        // Update presentation status to generating
        await supabase.rpc("update_presentation_with_token", {
          p_presentation_id: presentationId,
          p_token: shareToken,
          p_status: "generating",
        });

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
          
          // Stream the blackboard update
          controller.enqueue(encoder.encode(sseMessage("blackboard", fullEntry)));
          
          // Persist to database
          await supabase.rpc("append_presentation_blackboard_with_token", {
            p_presentation_id: presentationId,
            p_token: shareToken,
            p_entry: fullEntry,
          });
          
          return fullEntry;
        };

        // ============ TOOL IMPLEMENTATIONS ============

        // Tool: Read Settings
        const readSettings = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_settings", message: "Reading project settings..." })));
          
          try {
            const { data: project, error } = await supabase.rpc("get_project_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;

            collectedData.settings = project;

            const entries: BlackboardEntry[] = [];
            
            entries.push(await addToBlackboard({
              source: "read_settings",
              category: "observation",
              content: `Project "${project.name}" - ${project.description || "No description provided"}`,
              data: { name: project.name, description: project.description },
            }));

            if (project.organization) {
              entries.push(await addToBlackboard({
                source: "read_settings",
                category: "observation",
                content: `Organization: ${project.organization}`,
              }));
            }

            entries.push(await addToBlackboard({
              source: "read_settings",
              category: "insight",
              content: `Project created ${new Date(project.created_at).toLocaleDateString()}. This establishes the foundation for understanding the project's purpose and scope.`,
            }));

            return { tool: "read_settings", success: true, data: project, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_settings", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Requirements
        const readRequirements = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_requirements", message: "Reading requirements..." })));
          
          try {
            const { data: requirements, error } = await supabase.rpc("get_requirements_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;

            collectedData.requirements = requirements || [];
            const entries: BlackboardEntry[] = [];

            const count = requirements?.length || 0;
            entries.push(await addToBlackboard({
              source: "read_requirements",
              category: "observation",
              content: `Found ${count} requirements in the project`,
              data: { count },
            }));

            if (count > 0) {
              // Analyze requirement categories
              const topLevel = requirements.filter((r: any) => !r.parent_id);
              const nested = requirements.filter((r: any) => r.parent_id);
              
              entries.push(await addToBlackboard({
                source: "read_requirements",
                category: "insight",
                content: `Requirements structure: ${topLevel.length} top-level requirements with ${nested.length} nested items. This suggests a ${nested.length > topLevel.length * 2 ? "well-decomposed" : "high-level"} requirements breakdown.`,
                data: { topLevel: topLevel.length, nested: nested.length },
              }));

              // Extract key requirements
              const keyReqs = topLevel.slice(0, 5).map((r: any) => r.title);
              entries.push(await addToBlackboard({
                source: "read_requirements",
                category: "observation",
                content: `Key requirements: ${keyReqs.join(", ")}`,
                data: { keyRequirements: keyReqs },
              }));
            }

            return { tool: "read_requirements", success: true, data: requirements, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_requirements", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Artifacts
        const readArtifacts = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_artifacts", message: "Reading artifacts..." })));
          
          try {
            const { data: artifacts, error } = await supabase.rpc("get_artifacts_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;

            collectedData.artifacts = artifacts || [];
            const entries: BlackboardEntry[] = [];

            const count = artifacts?.length || 0;
            entries.push(await addToBlackboard({
              source: "read_artifacts",
              category: "observation",
              content: `Found ${count} artifacts in the project`,
              data: { count },
            }));

            if (count > 0) {
              // Count images
              const withImages = artifacts.filter((a: any) => a.image_url);
              entries.push(await addToBlackboard({
                source: "read_artifacts",
                category: "observation",
                content: `${withImages.length} artifacts have images that can be used in the presentation`,
                data: { imagesAvailable: withImages.length },
              }));

              // List artifact titles
              const titles = artifacts
                .filter((a: any) => a.ai_title)
                .slice(0, 5)
                .map((a: any) => a.ai_title);
              if (titles.length > 0) {
                entries.push(await addToBlackboard({
                  source: "read_artifacts",
                  category: "insight",
                  content: `Key documents: ${titles.join(", ")}`,
                  data: { documentTitles: titles },
                }));
              }
            }

            return { tool: "read_artifacts", success: true, data: artifacts, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_artifacts", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Canvas
        const readCanvas = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_canvas", message: "Reading canvas architecture..." })));
          
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

            const nodeCount = nodes?.length || 0;
            const edgeCount = edges?.length || 0;

            entries.push(await addToBlackboard({
              source: "read_canvas",
              category: "observation",
              content: `Canvas contains ${nodeCount} nodes and ${edgeCount} connections`,
              data: { nodes: nodeCount, edges: edgeCount },
            }));

            if (nodeCount > 0) {
              // Analyze node types
              const typeGroups: Record<string, number> = {};
              nodes.forEach((n: any) => {
                const type = n.type || "unknown";
                typeGroups[type] = (typeGroups[type] || 0) + 1;
              });

              entries.push(await addToBlackboard({
                source: "read_canvas",
                category: "insight",
                content: `Architecture components: ${Object.entries(typeGroups).map(([t, c]) => `${c} ${t}`).join(", ")}`,
                data: { nodeTypes: typeGroups },
              }));

              // Check connectivity
              if (edgeCount > 0) {
                const connectivity = edgeCount / nodeCount;
                entries.push(await addToBlackboard({
                  source: "read_canvas",
                  category: "estimate",
                  content: `Architecture connectivity ratio: ${connectivity.toFixed(2)} connections per node. ${connectivity > 1.5 ? "Well-connected architecture" : connectivity > 0.5 ? "Moderately connected" : "Sparse connections - may need review"}`,
                  data: { connectivityRatio: connectivity },
                }));
              }
            }

            return { tool: "read_canvas", success: true, data: { nodes, edges }, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_canvas", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Specifications
        const readSpecifications = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_specifications", message: "Reading specifications..." })));
          
          try {
            const { data: specs, error } = await supabase.rpc("get_latest_specifications_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;

            collectedData.specifications = specs || [];
            const entries: BlackboardEntry[] = [];

            const count = specs?.length || 0;
            entries.push(await addToBlackboard({
              source: "read_specifications",
              category: "observation",
              content: `Found ${count} generated specifications`,
              data: { count },
            }));

            if (count > 0) {
              const agentTitles = specs.map((s: any) => s.agent_title).filter(Boolean);
              entries.push(await addToBlackboard({
                source: "read_specifications",
                category: "insight",
                content: `Specifications available: ${agentTitles.join(", ")}. These provide detailed technical guidance.`,
                data: { specTypes: agentTitles },
              }));
            }

            return { tool: "read_specifications", success: true, data: specs, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_specifications", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Repo Structure
        const readRepoStructure = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_repo_structure", message: "Reading repository structure..." })));
          
          try {
            // Get repos first
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
              content: `Found ${repos?.length || 0} repositories with ${allFiles.length} total files`,
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

              entries.push(await addToBlackboard({
                source: "read_repo_structure",
                category: "insight",
                content: `Code organization: ${dirs.size} directories. Primary languages: ${Object.entries(extensions).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e, c]) => `${e} (${c})`).join(", ")}`,
                data: { directories: dirs.size, extensions },
              }));

              // Look for framework indicators
              const hasPackageJson = allFiles.some((f: any) => f.path === "package.json");
              const hasSrc = allFiles.some((f: any) => f.path.startsWith("src/"));
              const hasComponents = allFiles.some((f: any) => f.path.includes("/components/"));

              entries.push(await addToBlackboard({
                source: "read_repo_structure",
                category: "estimate",
                content: `Project maturity indicators: ${[hasPackageJson && "Has package.json", hasSrc && "Has src/ structure", hasComponents && "Has components/"].filter(Boolean).join(", ") || "Minimal structure"}`,
                data: { hasPackageJson, hasSrc, hasComponents },
              }));
            }

            return { tool: "read_repo_structure", success: true, data: { repos, files: allFiles }, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_repo_structure", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Databases
        const readDatabases = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_databases", message: "Reading database schemas..." })));
          
          try {
            const { data: databases, error } = await supabase.rpc("get_project_databases_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;

            collectedData.databases = databases || [];
            const entries: BlackboardEntry[] = [];

            const count = databases?.length || 0;
            entries.push(await addToBlackboard({
              source: "read_databases",
              category: "observation",
              content: `Found ${count} database(s) configured`,
              data: { count },
            }));

            if (count > 0) {
              const providers = [...new Set(databases.map((d: any) => d.provider))];
              const statuses = databases.map((d: any) => `${d.name}: ${d.status}`);
              
              entries.push(await addToBlackboard({
                source: "read_databases",
                category: "insight",
                content: `Database providers: ${providers.join(", ")}. Status: ${statuses.join(", ")}`,
                data: { providers, statuses },
              }));
            }

            return { tool: "read_databases", success: true, data: databases, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_databases", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Connections
        const readConnections = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_connections", message: "Reading external connections..." })));
          
          try {
            const { data: connections, error } = await supabase.rpc("get_database_connections_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;

            collectedData.connections = connections || [];
            const entries: BlackboardEntry[] = [];

            const count = connections?.length || 0;
            entries.push(await addToBlackboard({
              source: "read_connections",
              category: "observation",
              content: `Found ${count} external database connection(s)`,
              data: { count },
            }));

            if (count > 0) {
              const names = connections.map((c: any) => c.name);
              entries.push(await addToBlackboard({
                source: "read_connections",
                category: "insight",
                content: `External integrations: ${names.join(", ")}`,
                data: { connectionNames: names },
              }));
            }

            return { tool: "read_connections", success: true, data: connections, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_connections", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Deployments
        const readDeployments = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_deployments", message: "Reading deployments..." })));
          
          try {
            const { data: deployments, error } = await supabase.rpc("get_project_deployments_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;

            collectedData.deployments = deployments || [];
            const entries: BlackboardEntry[] = [];

            const count = deployments?.length || 0;
            entries.push(await addToBlackboard({
              source: "read_deployments",
              category: "observation",
              content: `Found ${count} deployment configuration(s)`,
              data: { count },
            }));

            if (count > 0) {
              const live = deployments.filter((d: any) => d.status === "deployed" || d.status === "live");
              const platforms = [...new Set(deployments.map((d: any) => d.platform))];
              
              entries.push(await addToBlackboard({
                source: "read_deployments",
                category: "insight",
                content: `${live.length} live deployment(s) on ${platforms.join(", ")}`,
                data: { liveCount: live.length, platforms },
              }));

              if (live.length > 0 && live[0].url) {
                entries.push(await addToBlackboard({
                  source: "read_deployments",
                  category: "observation",
                  content: `Live URL: ${live[0].url}`,
                  data: { url: live[0].url },
                }));
              }
            }

            return { tool: "read_deployments", success: true, data: deployments, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_deployments", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // ============ EXECUTE TOOLS SEQUENTIALLY ============
        
        const toolResults: ToolResult[] = [];

        // Phase 1: Foundation
        toolResults.push(await readSettings());

        // Phase 2: Requirements
        toolResults.push(await readRequirements());

        // Phase 3: Documentation
        toolResults.push(await readArtifacts());
        toolResults.push(await readSpecifications());

        // Phase 4: Architecture
        toolResults.push(await readCanvas());

        // Phase 5: Implementation
        toolResults.push(await readRepoStructure());
        toolResults.push(await readDatabases());
        toolResults.push(await readConnections());

        // Phase 6: Deployment
        toolResults.push(await readDeployments());

        // Phase 7: Synthesis - Generate final insights
        controller.enqueue(encoder.encode(sseMessage("status", { phase: "synthesis", message: "Synthesizing insights..." })));

        // Calculate completion estimates
        const reqCount = collectedData.requirements?.length || 0;
        const nodeCount = collectedData.canvas?.nodes?.length || 0;
        const fileCount = collectedData.repoStructure?.files?.length || 0;
        const specCount = collectedData.specifications?.length || 0;
        
        const completionScore = Math.min(100, Math.round(
          (reqCount > 0 ? 20 : 0) +
          (nodeCount > 0 ? 20 : 0) +
          (fileCount > 0 ? 30 : 0) +
          (specCount > 0 ? 15 : 0) +
          (collectedData.deployments?.length > 0 ? 15 : 0)
        ));

        await addToBlackboard({
          source: "synthesis",
          category: "estimate",
          content: `Overall project completion estimate: ${completionScore}%`,
          data: { completionScore, breakdown: { requirements: reqCount > 0, architecture: nodeCount > 0, code: fileCount > 0, specs: specCount > 0, deployed: collectedData.deployments?.length > 0 } },
        });

        // Generate key insights
        await addToBlackboard({
          source: "synthesis",
          category: "insight",
          content: `Project summary: ${collectedData.settings?.name || "Unnamed Project"} with ${reqCount} requirements, ${nodeCount} architecture components, and ${fileCount} code files.`,
          data: { summary: true },
        });

        // ============ GENERATE SLIDES WITH LLM ============
        controller.enqueue(encoder.encode(sseMessage("status", { phase: "generating_slides", message: "Generating slide content with AI..." })));

        // Build prompt for slide generation
        const slideGenerationPrompt = `You are creating a ${mode} presentation with approximately ${targetSlides} slides.

PROJECT DATA SUMMARY:
${JSON.stringify({
  name: collectedData.settings?.name,
  description: collectedData.settings?.description,
  requirements: { count: reqCount, topLevel: collectedData.requirements?.filter((r: any) => !r.parent_id).slice(0, 10).map((r: any) => r.title) },
  artifacts: { count: collectedData.artifacts?.length, titles: collectedData.artifacts?.slice(0, 5).map((a: any) => a.ai_title) },
  canvas: { nodes: nodeCount, edges: collectedData.canvas?.edges?.length },
  specifications: { count: specCount, types: collectedData.specifications?.map((s: any) => s.agent_title) },
  codeFiles: fileCount,
  databases: collectedData.databases?.length,
  deployments: collectedData.deployments?.length,
}, null, 2)}

BLACKBOARD INSIGHTS:
${blackboard.map(e => `[${e.category}] ${e.content}`).join("\n")}

${initialPrompt ? `USER'S CUSTOM FOCUS: ${initialPrompt}` : ""}

Generate a JSON array of slides following this structure. Each slide should have:
- id: unique string
- order: number (1-based)
- layoutId: one of "title-cover", "section-divider", "title-content", "two-column", "image-left", "image-right", "stats-grid", "chart-full", "table", "bullets", "quote", "architecture", "comparison", "timeline", "icon-grid"
- title: slide title
- subtitle: optional subtitle
- content: array of content blocks with { regionId, type, data }
- notes: optional speaker notes

For ${mode} mode, create ${mode === "concise" ? "10-15" : "20-30"} slides covering:
1. Cover slide with project name
2. Executive summary (BLUF)
3. Project overview
4. Requirements summary
5. Architecture overview
6. Technology stack
7. Current status/metrics
8. Challenges and risks
9. Opportunities
10. Next steps

Return ONLY valid JSON array, no markdown or explanation.`;

        // Call Gemini for slide generation
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: slideGenerationPrompt }] }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 8192,
              },
            }),
          }
        );

        const geminiData = await geminiResponse.json();
        let slidesJson: any[] = [];

        try {
          const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
          // Extract JSON from response
          const jsonMatch = rawText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            slidesJson = JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          console.error("Failed to parse slides JSON:", parseError);
          // Create minimal fallback slides
          slidesJson = [
            {
              id: generateId(),
              order: 1,
              layoutId: "title-cover",
              title: collectedData.settings?.name || "Project Presentation",
              subtitle: collectedData.settings?.description || "",
              content: [],
            },
            {
              id: generateId(),
              order: 2,
              layoutId: "bullets",
              title: "Overview",
              content: [
                {
                  regionId: "bullets",
                  type: "bullets",
                  data: { items: blackboard.filter(e => e.category === "insight").slice(0, 5).map(e => e.content) },
                },
              ],
            },
          ];
        }

        // Stream each generated slide
        for (const slide of slidesJson) {
          controller.enqueue(encoder.encode(sseMessage("slide", slide)));
        }

        // ============ SAVE FINAL PRESENTATION ============
        controller.enqueue(encoder.encode(sseMessage("status", { phase: "saving", message: "Saving presentation..." })));

        const metadata = {
          generatedAt: new Date().toISOString(),
          mode,
          targetSlides,
          actualSlides: slidesJson.length,
          dataStats: {
            requirements: reqCount,
            artifacts: collectedData.artifacts?.length || 0,
            canvasNodes: nodeCount,
            specifications: specCount,
            codeFiles: fileCount,
            databases: collectedData.databases?.length || 0,
            deployments: collectedData.deployments?.length || 0,
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

        // Send completion
        controller.enqueue(encoder.encode(sseMessage("complete", { 
          presentationId,
          slideCount: slidesJson.length,
          blackboardCount: blackboard.length,
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
