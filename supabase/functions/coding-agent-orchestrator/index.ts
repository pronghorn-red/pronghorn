import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AgentPromptSection {
  id: string;
  title: string;
  type: "static" | "dynamic";
  editable: "editable" | "readonly" | "substitutable";
  order: number;
  content: string;
  variables?: string[];
  isCustom?: boolean;
  enabled?: boolean;
}

interface ToolParamDefinition {
  type: string;
  required?: boolean;
  description: string;
}

interface ToolDefinition {
  description: string;
  category: string;
  enabled: boolean;
  params: Record<string, ToolParamDefinition>;
}

interface ToolsManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  file_operations: Record<string, ToolDefinition>;
  project_exploration_tools: Record<string, ToolDefinition>;
}

interface CustomToolDescriptions {
  file_operations?: Record<string, string>;
  project_exploration_tools?: Record<string, string>;
}

interface TaskRequest {
  projectId: string;
  repoId: string;
  taskDescription: string;
  attachedFiles: Array<{ id: string; path: string }>;
  projectContext: any;
  shareToken: string;
  mode: "task" | "iterative_loop" | "continuous_improvement";
  autoCommit?: boolean;
  chatHistory?: string;
  exposeProject?: boolean;
  maxIterations?: number;
  promptSections?: AgentPromptSection[];
  customToolDescriptions?: CustomToolDescriptions;
}

function parseAgentResponseText(rawText: string): any {
  const originalText = rawText.trim();
  let text = originalText;

  console.log("Parsing agent response, length:", rawText.length);
  console.log("Raw preview:", rawText.slice(0, 300) + (rawText.length > 300 ? "..." : ""));

  // Helper to try parsing safely
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

  // Method 1: Direct parse (clean JSON)
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

  // Method 3: Find ALL code blocks and try each one (in reverse order)
  const allFences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (let i = allFences.length - 1; i >= 0; i--) {
    const content = allFences[i][1].trim();
    if (content) {
      result = tryParse(content, `code fence #${i + 1} (reverse)`);
      if (result) return result;
    }
  }

  // Method 4: Brace matching on ORIGINAL text (most resilient)
  const firstBrace = originalText.indexOf("{");
  const lastBrace = originalText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = originalText.slice(firstBrace, lastBrace + 1);

    // Try raw first (preserves formatting)
    result = tryParse(candidate, "brace extraction (raw)");
    if (result) return result;

    // Try with whitespace normalization
    const cleaned = candidate
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    result = tryParse(cleaned, "brace extraction (cleaned)");
    if (result) return result;
  }

  // Method 5: Heuristic object match (last resort)
  const heuristicMatch = originalText.match(/(\{(?:[^{}]|"(?:\\.|[^"\\])*")*\})/);
  if (heuristicMatch) {
    result = tryParse(heuristicMatch[1], "heuristic object match");
    if (result) return result;
  }

  // Final fallback
  console.error("All JSON parsing methods failed for response:", originalText.slice(0, 1000));
  return {
    reasoning: "Failed to parse agent response as JSON. Raw output preserved.",
    raw_output: originalText.slice(0, 2000),
    operations: [],
    status: "parse_error",
  };
}

// Generate tool list text from manifest for prompt
function generateToolsListText(manifest: ToolsManifest, exposeProject: boolean): string {
  const lines: string[] = ["=== AVAILABLE TOOLS ===\n"];
  
  // File Operations
  lines.push("## FILE OPERATIONS\n");
  for (const [name, tool] of Object.entries(manifest.file_operations)) {
    if (!tool.enabled) continue;
    lines.push(`**${name}** [${tool.category}]`);
    lines.push(`  ${tool.description}`);
    if (Object.keys(tool.params).length > 0) {
      lines.push(`  Parameters:`);
      for (const [paramName, param] of Object.entries(tool.params)) {
        const required = param.required ? "(required)" : "(optional)";
        lines.push(`    - ${paramName}: ${param.type} ${required} - ${param.description}`);
      }
    }
    lines.push("");
  }
  
  // Project Exploration Tools (only if exposed)
  if (exposeProject) {
    lines.push("\n## PROJECT EXPLORATION TOOLS (READ-ONLY)\n");
    lines.push("You have READ-ONLY access to explore the entire project via these additional tools:\n");
    for (const [name, tool] of Object.entries(manifest.project_exploration_tools)) {
      if (!tool.enabled) continue;
      lines.push(`**${name}** [${tool.category}]`);
      lines.push(`  ${tool.description}`);
      if (Object.keys(tool.params).length > 0) {
        lines.push(`  Parameters:`);
        for (const [paramName, param] of Object.entries(tool.params)) {
          const required = param.required ? "(required)" : "(optional)";
          lines.push(`    - ${paramName}: ${param.type} ${required} - ${param.description}`);
        }
      }
      lines.push("");
    }
    lines.push("\nPROJECT EXPLORATION WORKFLOW:");
    lines.push("1. Start with project_inventory to see counts and previews of all categories");
    lines.push("2. Use project_category to load full details of categories you need");
    lines.push("3. Use project_elements to fetch specific items by ID");
    lines.push("\nThese tools are READ-ONLY. Use them to understand context and inform your file operations.");
  }
  
  return lines.join("\n");
}

// Generate response schema text for prompt
function generateResponseSchemaText(manifest: ToolsManifest, exposeProject: boolean): string {
  const allToolNames = [
    ...Object.keys(manifest.file_operations),
    ...(exposeProject ? Object.keys(manifest.project_exploration_tools) : [])
  ];
  
  return `When responding, structure your response as:
{
  "reasoning": "Your chain-of-thought reasoning about what to do next",
  "operations": [
    {
      "type": "${allToolNames[0] || "list_files"}" | "${allToolNames.slice(1, 4).join('" | "')}" | ...,
      "params": { /* tool-specific parameters from the AVAILABLE TOOLS section */ }
    }
  ],
  "blackboard_entry": {
    "entry_type": "planning" | "progress" | "decision" | "reasoning" | "next_steps" | "reflection",
    "content": "Your memory/reflection for this step"
  },
  "status": "in_progress" | "completed" | "requires_commit"
}

Available operation types: ${allToolNames.join(", ")}`;
}

// Generate Grok/xAI structured output schema dynamically from manifest
function generateGrokSchema(manifest: ToolsManifest, exposeProject: boolean) {
  const allToolNames = [
    ...Object.keys(manifest.file_operations),
    ...(exposeProject ? Object.keys(manifest.project_exploration_tools) : [])
  ];
  
  // Build params properties from manifest
  const paramsProperties: Record<string, any> = {};
  const allTools = { ...manifest.file_operations, ...(exposeProject ? manifest.project_exploration_tools : {}) };
  
  for (const tool of Object.values(allTools)) {
    for (const [paramName, param] of Object.entries(tool.params)) {
      if (!paramsProperties[paramName]) {
        // Convert type string to JSON schema type
        let jsonType: any = "string";
        if (param.type.includes("null")) {
          jsonType = ["string", "null"];
        } else if (param.type === "integer") {
          jsonType = "integer";
        } else if (param.type === "array") {
          jsonType = "array";
        }
        paramsProperties[paramName] = { type: jsonType, description: param.description };
      }
    }
  }
  
  return {
    type: "json_schema",
    json_schema: {
      name: "coding_agent_response",
      strict: true,
      schema: {
        type: "object",
        properties: {
          reasoning: {
            type: "string",
            description: "Chain-of-thought reasoning about what to do next",
          },
          operations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: allToolNames,
                },
                params: {
                  type: "object",
                  description: "Operation-specific parameters. Only include parameters relevant to the operation type.",
                  properties: paramsProperties,
                },
              },
              required: ["type", "params"],
            },
          },
          blackboard_entry: {
            type: "object",
            properties: {
              entry_type: {
                type: "string",
                enum: ["planning", "progress", "decision", "reasoning", "next_steps", "reflection"],
              },
              content: { type: "string" },
            },
            required: ["entry_type", "content"],
          },
          status: {
            type: "string",
            enum: ["in_progress", "completed", "requires_commit"],
          },
        },
        required: ["reasoning", "operations", "status", "blackboard_entry"],
      },
    },
  };
}

// Generate Claude/Anthropic tool schema dynamically from manifest
function generateClaudeSchema(manifest: ToolsManifest, exposeProject: boolean) {
  const allToolNames = [
    ...Object.keys(manifest.file_operations),
    ...(exposeProject ? Object.keys(manifest.project_exploration_tools) : [])
  ];
  
  // Build params properties from manifest
  const paramsProperties: Record<string, any> = {};
  const allTools = { ...manifest.file_operations, ...(exposeProject ? manifest.project_exploration_tools : {}) };
  
  for (const tool of Object.values(allTools)) {
    for (const [paramName, param] of Object.entries(tool.params)) {
      if (!paramsProperties[paramName]) {
        let jsonType: any = "string";
        if (param.type.includes("null")) {
          jsonType = ["string", "null"];
        } else if (param.type === "integer") {
          jsonType = "integer";
        } else if (param.type === "array") {
          jsonType = "array";
        }
        paramsProperties[paramName] = { type: jsonType, description: param.description };
      }
    }
  }
  
  return {
    name: "respond_with_actions",
    description: "Return your reasoning, file operations, and status as structured output. You MUST use this tool to respond.",
    input_schema: {
      type: "object",
      properties: {
        reasoning: {
          type: "string",
          description: "Chain-of-thought reasoning about what to do next",
        },
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: allToolNames,
              },
              params: {
                type: "object",
                description: "Operation-specific parameters. Only include parameters relevant to the operation type.",
                properties: paramsProperties,
              },
            },
            required: ["type", "params"],
            additionalProperties: false,
          },
        },
        blackboard_entry: {
          type: "object",
          properties: {
            entry_type: {
              type: "string",
              enum: ["planning", "progress", "decision", "reasoning", "next_steps", "reflection"],
            },
            content: { type: "string" },
          },
          required: ["entry_type", "content"],
          additionalProperties: false,
        },
        status: {
          type: "string",
          enum: ["in_progress", "completed", "requires_commit"],
        },
      },
      required: ["reasoning", "operations", "status", "blackboard_entry"],
      additionalProperties: false,
    },
  };
}

// Old hardcoded getClaudeResponseTool removed - now using generateClaudeSchema() above

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let sessionId: string | null = null;
  let shareToken: string | null = null;
  let supabase: any = null;

  try {
    const authHeader = req.headers.get("authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });

    const requestData: TaskRequest = await req.json();
    shareToken = requestData.shareToken;
    const {
      projectId,
      repoId,
      taskDescription,
      attachedFiles,
      projectContext,
      mode,
      autoCommit = false,
      chatHistory,
      exposeProject = false,
      maxIterations: requestedMaxIterations = 30,
      promptSections,
      customToolDescriptions,
    } = requestData;

    console.log("Starting CodingAgent task:", { projectId, mode, taskDescription });

    // Get project settings for API key and model selection
    const { data: project, error: projectError } = await supabase.rpc("get_project_with_token", {
      p_project_id: projectId,
      p_token: shareToken,
    });

    if (projectError) throw projectError;

    const selectedModel = project.selected_model || "gemini-2.5-flash";
    const maxTokens = project.max_tokens || 32768;

    // Select API key based on model
    let apiKey: string;
    let apiEndpoint: string;
    let modelName: string;

    if (selectedModel.startsWith("gemini")) {
      apiKey = Deno.env.get("GEMINI_API_KEY")!;
      apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;
      modelName = selectedModel;
    } else if (selectedModel.startsWith("claude")) {
      apiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
      apiEndpoint = "https://api.anthropic.com/v1/messages";
      modelName = selectedModel;
    } else if (selectedModel.startsWith("grok")) {
      apiKey = Deno.env.get("XAI_API_KEY")!;
      apiEndpoint = "https://api.x.ai/v1/chat/completions";
      modelName = selectedModel;
    } else {
      throw new Error(`Unsupported model: ${selectedModel}`);
    }

    if (!apiKey) {
      throw new Error(`API key not configured for model: ${selectedModel}`);
    }

    // Create agent session
    const { data: session, error: sessionError } = await supabase.rpc("create_agent_session_with_token", {
      p_project_id: projectId,
      p_mode: mode,
      p_task_description: taskDescription,
      p_token: shareToken,
    });

    if (sessionError) throw sessionError;
    if (!session) throw new Error("Failed to create session");

    sessionId = session.id;

    // Log user's task as first message
    await supabase.rpc("insert_agent_message_with_token", {
      p_session_id: sessionId,
      p_token: shareToken,
      p_role: "user",
      p_content: taskDescription,
      p_metadata: { attachedFiles, projectContext },
    });
    
    // Broadcast to notify subscribers immediately
    await supabase.channel(`agent-messages-project-${projectId}`).send({
      type: 'broadcast',
      event: 'agent_message_refresh',
      payload: { sessionId, iteration: 0 }
    });
    
    console.log("Created session:", session.id);

    // Load instruction manifest - full structure with params for schema generation
    const manifest: ToolsManifest = {
      id: "coding-agent-tools",
      name: "Coding Agent Tools Manifest",
      version: "1.1.0",
      description: "Unified tool definitions",
      file_operations: {
        list_files: { description: "List all files with metadata (id, path, updated_at). MUST be called FIRST to load file structure.", category: "discovery", enabled: true, params: { path_prefix: { type: "string | null", required: false, description: "Filter files by path prefix" } } },
        wildcard_search: { description: "Multi-term search across all files. Returns ranked results by match count.", category: "discovery", enabled: true, params: { query: { type: "string", required: true, description: "Multi-term search query" } } },
        search: { description: "Search file paths and content by single keyword.", category: "discovery", enabled: true, params: { keyword: { type: "string", required: true, description: "Single keyword to search" } } },
        read_file: { description: "Read complete content of a single file. Returns content WITH LINE NUMBERS prefixed as <<N>>.", category: "read", enabled: true, params: { file_id: { type: "string", required: false, description: "UUID of file" }, path: { type: "string", required: false, description: "File path (alternative to file_id)" } } },
        edit_lines: { description: "Edit specific line range in a file and stage the change.", category: "write", enabled: true, params: { file_id: { type: "string", required: false, description: "UUID of file" }, path: { type: "string", required: false, description: "File path" }, start_line: { type: "integer", required: true, description: "Starting line number (1-based)" }, end_line: { type: "integer", required: true, description: "Ending line number (inclusive)" }, new_content: { type: "string", required: true, description: "Replacement content" } } },
        create_file: { description: "Create new file and stage as add operation.", category: "write", enabled: true, params: { path: { type: "string", required: true, description: "Full path for new file" }, content: { type: "string", required: true, description: "File content" } } },
        delete_file: { description: "Delete file and stage as delete operation.", category: "write", enabled: true, params: { file_id: { type: "string", required: false, description: "UUID of file" }, path: { type: "string", required: false, description: "File path" } } },
        move_file: { description: "Move or rename file to a new path.", category: "write", enabled: true, params: { file_id: { type: "string", required: false, description: "UUID of file" }, path: { type: "string", required: false, description: "Current file path" }, new_path: { type: "string", required: true, description: "New path" } } },
        get_staged_changes: { description: "View all currently staged changes.", category: "staging", enabled: true, params: {} },
        unstage_file: { description: "Discard a specific staged change by file_path.", category: "staging", enabled: true, params: { file_path: { type: "string", required: true, description: "File path to unstage" } } },
        discard_all_staged: { description: "Discard ALL staged changes. Use with EXTREME CAUTION.", category: "staging", enabled: true, params: {} },
      },
      project_exploration_tools: {
        project_inventory: { description: "Returns counts and brief previews for ALL project elements in one call.", category: "project", enabled: true, params: {} },
        project_category: { description: "Load ALL items from a specific category with full details.", category: "project", enabled: true, params: { category: { type: "string", required: true, description: "Category name" } } },
        project_elements: { description: "Load SPECIFIC elements by their IDs with full details.", category: "project", enabled: true, params: { elements: { type: "array", required: true, description: "Array of {category, id} pairs" } } },
      },
    };

    // Merge custom tool descriptions if provided by the client
    if (customToolDescriptions) {
      console.log("[coding-agent-orchestrator] Merging custom tool descriptions");
      
      // Merge file_operations custom descriptions
      if (customToolDescriptions.file_operations) {
        for (const [toolName, desc] of Object.entries(customToolDescriptions.file_operations)) {
          if (manifest.file_operations[toolName]) {
            manifest.file_operations[toolName].description = desc;
          }
        }
      }
      
      // Merge project_exploration_tools custom descriptions
      if (customToolDescriptions.project_exploration_tools && manifest.project_exploration_tools) {
        for (const [toolName, desc] of Object.entries(customToolDescriptions.project_exploration_tools)) {
          if (manifest.project_exploration_tools[toolName]) {
            manifest.project_exploration_tools[toolName].description = desc;
          }
        }
      }
    }

    // Describe attached files by id and path only (let the agent read them via tools)
    let attachedFilesSection = "";
    if (attachedFiles && attachedFiles.length > 0) {
      const attachedList = attachedFiles.map((f) => `- ${f.path} (file_id: ${f.id})`).join("\n");
      attachedFilesSection = `\n\n🔗 USER HAS ATTACHED ${attachedFiles.length} FILE(S) - THESE FILES ARE YOUR PRIMARY FOCUS:\n${attachedList}\n\nCRITICAL: The file_id values are PROVIDED ABOVE. Use read_file directly with these IDs - DO NOT call list_files first. Only use list_files if NO files are attached and you need to search. For attached files, immediately use read_file with the provided file_id.`;
    }

    // Build rich context summary from ProjectSelector data
    let contextSummary = "";
    if (projectContext) {
      const parts: string[] = [];

      if (projectContext.projectMetadata) {
        const meta = projectContext.projectMetadata as any;
        parts.push(
          `Project: ${meta.name}\n` +
            (meta.description ? `Description: ${meta.description}\n` : "") +
            (meta.organization ? `Organization: ${meta.organization}\n` : "") +
            (meta.scope ? `Scope: ${meta.scope}\n` : ""),
        );
      }

      if (projectContext.artifacts?.length > 0) {
        const artifacts = projectContext.artifacts as any[];
        const preview = artifacts
          .slice(0, 5)
          .map((a, index) => {
            const title = a.ai_title || a.title || `Artifact ${index + 1}`;
            const summary = a.ai_summary || (a.content ? String(a.content).slice(0, 160) : "");
            return `- ${title}: ${summary}`;
          })
          .join("\n");
        parts.push(`Artifacts (${artifacts.length} total, showing up to 5):\n${preview}`);
      }

      if (projectContext.requirements?.length > 0) {
        const reqs = projectContext.requirements as any[];
        const preview = reqs
          .slice(0, 10)
          .map((r) => {
            const code = r.code ? `${r.code} - ` : "";
            const contentSnippet = r.content ? String(r.content).slice(0, 160) : "";
            return `- ${code}${r.title}: ${contentSnippet}`;
          })
          .join("\n");
        parts.push(`Requirements (${reqs.length} total, showing up to 10):\n${preview}`);
      }

      if (projectContext.standards?.length > 0) {
        const stds = projectContext.standards as any[];
        const preview = stds
          .slice(0, 10)
          .map((s) => {
            const code = s.code ? `${s.code} - ` : "";
            const desc = s.description ? String(s.description).slice(0, 160) : "";
            return `- ${code}${s.title}: ${desc}`;
          })
          .join("\n");
        parts.push(`Standards (${stds.length} total, showing up to 10):\n${preview}`);
      }

      if (projectContext.techStacks?.length > 0) {
        const stacks = projectContext.techStacks as any[];
        const preview = stacks
          .slice(0, 10)
          .map((t) => {
            const type = t.type ? ` [${t.type}]` : "";
            const desc = t.description ? String(t.description).slice(0, 120) : "";
            return `- ${t.name}${type}: ${desc}`;
          })
          .join("\n");
        parts.push(`Tech Stacks (${stacks.length} total, showing up to 10):\n${preview}`);
      }

      if (projectContext.canvasNodes?.length > 0) {
        const nodes = projectContext.canvasNodes as any[];
        const preview = nodes
          .slice(0, 20)
          .map((n) => {
            const data = (n.data || {}) as any;
            const type = data.type || n.type || "node";
            const label = data.label || data.title || data.name || n.id;
            return `- [${type}] ${label}`;
          })
          .join("\n");
        parts.push(`Canvas Nodes (${nodes.length} total, showing up to 20):\n${preview}`);
      }

      if (projectContext.canvasEdges?.length > 0) {
        const edges = projectContext.canvasEdges as any[];
        const preview = edges
          .slice(0, 20)
          .map((e) => `- ${e.source_id} -> ${e.target_id}${e.label ? ` (${e.label})` : ""}`)
          .join("\n");
        parts.push(`Canvas Edges (${edges.length} total, showing up to 20):\n${preview}`);
      }

      if (projectContext.files?.length > 0) {
        const files = projectContext.files as any[];
        // Include FULL content for ALL attached files - user explicitly selected these
        const allFilesContent = files.map((f: any) => 
          `### FILE: ${f.path}\n\`\`\`\n${f.content || ''}\n\`\`\``
        ).join("\n\n");
        
        parts.push(`Repository Files (${files.length} attached by user - FULL CONTENT):\n\n${allFilesContent}`);
      }

      if (projectContext.databases?.length > 0) {
        const dbs = projectContext.databases as any[];
        const dbItems = dbs.map((d: any) => {
          let itemStr = `### ${d.type.toUpperCase()}: ${d.schemaName}.${d.name}`;
          if (d.definition) {
            itemStr += `\n\`\`\`sql\n${d.definition}\n\`\`\``;
          }
          if (d.columns?.length) {
            const colDetails = d.columns.map((c: any) => {
              let col = `  - ${c.name}: ${c.type}`;
              if (c.isPrimaryKey) col += ' [PK]';
              if (c.isForeignKey) col += ` [FK -> ${c.foreignKeyRef}]`;
              if (!c.nullable) col += ' NOT NULL';
              if (c.default) col += ` DEFAULT ${c.default}`;
              return col;
            }).join('\n');
            itemStr += `\nColumns:\n${colDetails}`;
          }
          if (d.indexes?.length) {
            const idxDetails = d.indexes.map((i: any) => `  - ${i.name}: ${i.definition}`).join('\n');
            itemStr += `\nIndexes:\n${idxDetails}`;
          }
          if (d.sql_content) itemStr += `\n\`\`\`sql\n${d.sql_content}\n\`\`\``;
          if (d.sampleData?.length) itemStr += `\nSample data: ${d.sampleData.length} rows\n${JSON.stringify(d.sampleData.slice(0, 3), null, 2)}`;
          return itemStr;
        }).join("\n\n");
        parts.push(`DATABASE SCHEMAS (${dbs.length} items attached):\n\n${dbItems}`);
      }

      contextSummary = parts.join("\n\n");
    }

    // Build chat history section
    let chatHistorySection = "";
    if (chatHistory && chatHistory.trim()) {
      chatHistorySection = `\n\n📜 RECENT CONVERSATION CONTEXT:\n${chatHistory}\n--- END CONVERSATION CONTEXT ---`;
    }

    // Dynamic system prompt builder - substitutes variables in prompt sections
    function buildDynamicSystemPrompt(
      sections: AgentPromptSection[], 
      currentIteration: number = 1, 
      maxIterations: number = 30,
      blackboardEntries: string = ""
    ): string {
      // Filter out disabled sections, then sort by order
      const enabledSections = sections.filter(s => s.enabled !== false);
      const sortedSections = [...enabledSections].sort((a, b) => a.order - b.order);
      
      console.log(`[buildDynamicSystemPrompt] ${sections.length} total sections, ${enabledSections.length} enabled`);
      
      // Generate dynamic content from manifest
      const toolsListText = generateToolsListText(manifest, exposeProject);
      const responseSchemaText = generateResponseSchemaText(manifest, exposeProject);
      
      // Determine which attached files section to use
      const hasAttachedFiles = attachedFiles && attachedFiles.length > 0;
      
      // Filter sections based on attached files state
      const filteredSections = sortedSections.filter(s => {
        // Show "attached_files_with" only when files are attached
        if (s.id === "attached_files_with") return hasAttachedFiles;
        // Show "attached_files_without" only when no files are attached
        if (s.id === "attached_files_without") return !hasAttachedFiles;
        // Legacy support for old templates
        if (s.id === "attached_files_instruction") return true;
        return true;
      });
      
      // Build variable substitutions
      const variables: Record<string, string> = {
        // New unified variables
        "{{TOOLS_LIST}}": toolsListText,
        "{{RESPONSE_SCHEMA}}": responseSchemaText,
        // Runtime values
        "{{TASK_MODE}}": mode,
        "{{AUTO_COMMIT}}": String(autoCommit),
        "{{PROJECT_CONTEXT}}": contextSummary ? `Project Context:\n${contextSummary}` : "",
        "{{ATTACHED_FILES_LIST}}": attachedFilesSection,
        // Legacy support for old templates
        "{{ATTACHED_FILES_INSTRUCTION}}": hasAttachedFiles
          ? `The user has attached specific file(s) with their file_id values listed above. DO NOT call list_files first - use read_file directly with the provided file_id values to work with these files immediately.${attachedFilesSection}`
          : `Your FIRST operation MUST be list_files or wildcard_search to get CURRENT file IDs.
File IDs from chat history are STALE and INVALID - never reuse them!
{
  "type": "list_files",
  "params": { "path_prefix": null }
}
This loads the complete file structure with all CURRENT file IDs and paths. You CANNOT edit, read, or delete files without getting their IDs from THIS session first.`,
        "{{CHAT_HISTORY}}": chatHistorySection,
        // Deprecated - kept for backward compatibility with old custom configs
        "{{FILE_OPERATIONS}}": JSON.stringify(manifest.file_operations, null, 2),
        "{{TOOLS_MANIFEST}}": JSON.stringify(manifest, null, 2),
        // New dynamic variables for iteration and blackboard
        "{{BLACKBOARD}}": blackboardEntries ? `=== AGENT BLACKBOARD (Your Memory) ===\n${blackboardEntries}` : "",
        "{{CURRENT_ITERATION}}": String(currentIteration),
        "{{MAX_ITERATIONS}}": String(maxIterations),
      };

      // Build prompt from sections, substituting variables
      const promptParts: string[] = [];
      
      for (const section of filteredSections) {
        let content = section.content;
        
        // Substitute all variables in the content
        for (const [varName, varValue] of Object.entries(variables)) {
          content = content.replace(new RegExp(varName.replace(/[{}]/g, '\\$&'), 'g'), varValue);
        }
        
        // Skip empty dynamic sections (e.g., no chat history, no project exploration)
        if (section.type === "dynamic" && !content.trim()) {
          continue;
        }
        
        promptParts.push(content);
      }

      return promptParts.join("\n\n");
    }

    // Embedded default prompt template (mirrors /public/data/codingAgentPromptTemplate.json v1.2.0)
    const defaultPromptSections: AgentPromptSection[] = [
      {
        id: "response_format_critical",
        title: "Critical Response Format",
        type: "static",
        editable: "editable",
        order: 1,
        content: "CRITICAL: You MUST respond with ONLY valid JSON. No prose, no markdown, no explanations outside the JSON structure."
      },
      {
        id: "identity",
        title: "Agent Identity",
        type: "static",
        editable: "editable",
        order: 2,
        content: "You are CodingAgent, an autonomous coding agent that can explore, read, create, edit, move, and delete files in a repository. You work by responding with structured JSON containing operations to perform."
      },
      {
        id: "tools_list",
        title: "Available Tools",
        type: "dynamic",
        editable: "readonly",
        order: 3,
        content: "{{TOOLS_LIST}}"
      },
      {
        id: "task_mode",
        title: "Task Mode & Settings",
        type: "dynamic",
        editable: "editable",
        order: 4,
        content: `=== TASK MODE: {{TASK_MODE}} ===

Task modes define your approach:
- **task**: Focus on completing a specific user request
- **iterative_loop**: Work through multiple iterations with feedback
- **continuous_improvement**: Ongoing refinement and optimization

Auto-commit: {{AUTO_COMMIT}}
When auto-commit is enabled (true), your staged changes will be automatically committed after each operation. When disabled (false), changes remain staged for manual review.

Adjust your behavior based on the current mode.`
      },
      {
        id: "critical_rules",
        title: "Critical Rules",
        type: "static",
        editable: "editable",
        order: 5,
        content: `=== CRITICAL RULES (MUST FOLLOW) ===
1. NEVER use replace_file unless the file is <150 lines OR it's a config file (package.json, tsconfig.json, etc.)
2. ALWAYS prefer edit_lines over full file replacement - it preserves git blame and produces cleaner diffs
3. ALWAYS call list_files or wildcard_search FIRST if no files are attached to get current file IDs
4. NEVER assume file paths exist - always verify with list_files or search first
5. ALWAYS include a blackboard_entry in EVERY response (it is required)
6. If task involves multiple files, list them explicitly in your planning blackboard entry
7. Before setting status='completed', call get_staged_changes to verify what you've modified
8. After each edit_lines operation, verify the result using the verification object in the response
9. Use get_staged_changes to see what you've already staged before making duplicate edits
10. Only use discard_all_staged when user EXPLICITLY requests a full reset - this is destructive`
      },
      {
        id: "project_context",
        title: "Project Context",
        type: "dynamic",
        editable: "readonly",
        order: 6,
        content: "{{PROJECT_CONTEXT}}"
      },
      {
        id: "file_id_warning",
        title: "File ID Warning",
        type: "static",
        editable: "editable",
        order: 7,
        content: `⚠️ CRITICAL WARNING ABOUT FILE IDs FROM CHAT HISTORY:
Any file IDs mentioned in the RECENT CONVERSATION CONTEXT above are from PREVIOUS sessions and are STALE/INVALID.
File IDs change when:
- Files are committed (staging is cleared, new IDs assigned)
- Files are deleted and re-created
- New agent sessions start

NEVER use file IDs from chat history directly!
ALWAYS call list_files or wildcard_search FIRST to get CURRENT, VALID file IDs for THIS session.
Even if chat history shows "file_id: abc123", that ID is INVALID - you MUST get fresh IDs.`
      },
      {
        id: "attached_files_with",
        title: "When Files Are Attached",
        type: "dynamic",
        editable: "editable",
        order: 8,
        content: `The user has attached specific file(s) with their file_id values listed above. DO NOT call list_files first - use read_file directly with the provided file_id values to work with these files immediately.

{{ATTACHED_FILES_LIST}}`
      },
      {
        id: "attached_files_without",
        title: "When No Files Attached",
        type: "static",
        editable: "editable",
        order: 9,
        content: `Your FIRST operation MUST be list_files or wildcard_search to get CURRENT file IDs.
File IDs from chat history are STALE and INVALID - never reuse them!
{
  "type": "list_files",
  "params": { "path_prefix": null }
}
This loads the complete file structure with all CURRENT file IDs and paths. You CANNOT edit, read, or delete files without getting their IDs from THIS session first.`
      },
      {
        id: "response_structure",
        title: "Response Structure",
        type: "dynamic",
        editable: "readonly",
        order: 10,
        content: "{{RESPONSE_SCHEMA}}"
      },
      {
        id: "line_number_rules",
        title: "Line Number Rules",
        type: "static",
        editable: "editable",
        order: 11,
        content: `READ_FILE LINE NUMBER FORMAT:
When you call read_file, the content is returned with line numbers prefixed as <<N>> where N is the line number.
IMPORTANT: The <<N>> markers are for YOUR REFERENCE ONLY - NEVER include <<N>> in your edit_lines new_content.
When specifying start_line and end_line for edit_lines, use the numbers shown in <<N>>.`
      },
      {
        id: "additional_rules",
        title: "Additional Critical Rules",
        type: "static",
        editable: "editable",
        order: 12,
        content: `CRITICAL RULES:
1. If user attached files, use read_file directly with those IDs - DO NOT call list_files first
2. If no files attached, start with list_files OR wildcard_search
3. PREFER "path" over "file_id" for all operations - system resolves paths automatically
4. Work autonomously - DO NOT STOP AFTER A SINGLE OPERATION
5. Set status="in_progress" when you need more operations
6. Set status="requires_commit" when changes are ready
7. Set status="completed" ONLY after exhaustively completing the request
8. MANDATORY BEFORE EDIT_LINES: Call read_file first to see current content
9. NEVER include <<N>> markers in your new_content`
      },
      {
        id: "edit_lines_modes",
        title: "Edit Lines Operation Modes",
        type: "static",
        editable: "editable",
        order: 13,
        content: `EDIT_LINES OPERATION MODES:
1. REPLACE LINES: start_line=X, end_line=Y replaces lines X-Y with new_content
2. INSERT ONLY: end_line = start_line - 1 inserts WITHOUT deleting anything
3. APPEND TO END: start_line = total_lines + 1 appends at end`
      },
      {
        id: "operation_batching",
        title: "Operation Batching",
        type: "static",
        editable: "editable",
        order: 14,
        content: `OPERATION BATCHING - Include multiple operations per response for efficiency.
Batch up to 10 edit_lines operations in ONE response. Don't wait for separate iterations.`
      },
      {
        id: "iteration_philosophy",
        title: "Iteration Philosophy",
        type: "static",
        editable: "editable",
        order: 15,
        content: `ITERATION PHILOSOPHY - DRIVE DEEP:
You have many iterations available. USE THEM. Implement completely, handle edge cases, verify changes.`
      },
      {
        id: "completion_validation",
        title: "Completion Validation",
        type: "static",
        editable: "editable",
        order: 16,
        content: `BEFORE marking status="completed":
1. Call list_files to verify project state
2. Re-read original task and confirm ALL requirements met
3. Verify changes by reading back modified files
4. Handle edge cases and error conditions`
      },
      {
        id: "response_enforcement",
        title: "Response Format Enforcement",
        type: "static",
        editable: "editable",
        order: 17,
        content: `RESPONSE FORMAT: Your entire response must be a single valid JSON object.
Start with { and end with }. No text before or after.`
      },
      {
        id: "blackboard",
        title: "Agent Blackboard",
        type: "dynamic",
        editable: "readonly",
        order: 18,
        content: "{{BLACKBOARD}}"
      },
      {
        id: "iteration_status",
        title: "Iteration Status",
        type: "dynamic",
        editable: "readonly",
        order: 19,
        content: "Current iteration: {{CURRENT_ITERATION}} of {{MAX_ITERATIONS}}"
      }
    ];

    // Build system prompt - use custom sections if provided, otherwise use embedded default
    const sectionsToUse = (promptSections && promptSections.length > 0) ? promptSections : defaultPromptSections;
    console.log(`Building dynamic system prompt from ${sectionsToUse.length} sections (custom: ${promptSections && promptSections.length > 0})`);
    
    // We'll rebuild the prompt each iteration with updated blackboard and iteration count
    // Initial prompt built without iteration-specific data (will be rebuilt in loop)
    let systemPrompt = buildDynamicSystemPrompt(sectionsToUse, 1, requestedMaxIterations, "");
    // Autonomous iteration loop - use requested max or default to 30, cap at 500
    const MAX_ITERATIONS = Math.min(Math.max(requestedMaxIterations, 1), 500);
    console.log(`Max iterations set to: ${MAX_ITERATIONS} (requested: ${requestedMaxIterations})`);
    
    let iteration = 0;
    let conversationHistory: Array<{ role: string; content: string }> = [];
    let finalStatus = "running";
    let allOperationResults: any[] = [];
    // Ephemeral context holds full operation results for current iteration only (NOT added to history)
    let ephemeralContext: any[] = [];
    
    // Session file registry: tracks files created/modified during this session
    // Maps file path -> { staging_id, path, content, created_at }
    // This prevents stale file_id issues when agent tries to read/edit newly created files
    const sessionFileRegistry = new Map<string, { 
      staging_id: string; 
      path: string; 
      content: string;
      created_at: Date;
    }>();
    console.log("[SESSION] Initialized sessionFileRegistry for tracking session-created files");

    conversationHistory.push({ role: "user", content: `Task: ${taskDescription}` });

    while (iteration < MAX_ITERATIONS) {
      // Check if abort was requested before starting this iteration
      const { data: sessionCheck, error: sessionCheckError } = await supabase.rpc("get_agent_session_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
      });

      if (sessionCheckError) {
        console.error("Error checking session status:", sessionCheckError);
      } else if (sessionCheck && sessionCheck.length > 0) {
        const session = sessionCheck[0];
        if (session.abort_requested || session.status === "aborted") {
          console.log("Abort requested, stopping iteration loop");
          finalStatus = "aborted";
          break;
        }
      }

      iteration++;
      console.log(`\n=== Iteration ${iteration} ===`);

      // Fetch blackboard entries from previous iterations to inject into prompt
      let blackboardSummary = "";
      try {
        const { data: blackboardEntries } = await supabase.rpc("get_agent_blackboard_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
        });
        if (blackboardEntries && blackboardEntries.length > 0) {
          blackboardSummary = blackboardEntries
            .slice(-10) // Last 10 entries to avoid prompt bloat
            .map((e: any) => `[${e.entry_type}] ${e.content}`)
            .join("\n");
        }
      } catch (err) {
        console.warn("Could not fetch blackboard entries:", err);
      }

      // Rebuild system prompt with current iteration data
      systemPrompt = buildDynamicSystemPrompt(sectionsToUse, iteration, MAX_ITERATIONS, blackboardSummary);
      // Build conversation with ephemeral context injected for this iteration only
      let conversationForLLM = [...conversationHistory];
      if (ephemeralContext.length > 0) {
        // Inject full operation results as ephemeral context (for read_file content, etc.)
        // This is NOT stored in conversationHistory - only used for this single LLM call
        conversationForLLM.push({
          role: "user",
          content: `[EPHEMERAL CONTEXT - Full operation results from last iteration]\n${JSON.stringify(ephemeralContext, null, 2)}\n[END EPHEMERAL CONTEXT]`,
        });
      }
      // Clear ephemeral context after building conversationForLLM (will be repopulated after this iteration's operations)
      const ephemeralContextForLog = [...ephemeralContext]; // Keep copy for logging
      ephemeralContext = [];

      // Build full input prompt for logging - MUST include the EXACT prompt sent to LLM including ephemeral context
      const fullInputPrompt = JSON.stringify({
        systemPrompt: systemPrompt,
        conversationForLLM: conversationForLLM,
        timestamp: new Date().toISOString()
      }, null, 2);
      const inputCharCount = systemPrompt.length + conversationForLLM.reduce((acc, msg) => acc + msg.content.length, 0);

      // Call LLM based on provider
      let llmResponse: any;

      if (selectedModel.startsWith("gemini")) {
        // Gemini API with system instruction
        const contents = conversationForLLM.map((msg) => ({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        }));

        llmResponse = await fetch(`${apiEndpoint}?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            contents,
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature: 0.7,
              responseMimeType: "application/json",
            },
          }),
        });
      } else if (selectedModel.startsWith("claude")) {
        // Anthropic API with strict tool use for structured output
        console.log(`Using Claude model ${modelName} with strict tool use enforcement`);
        
        const messages = conversationForLLM.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        llmResponse = await fetch(apiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "structured-outputs-2025-11-13",
          },
          body: JSON.stringify({
            model: modelName,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages,
            tools: [generateClaudeSchema(manifest, exposeProject)],
            tool_choice: { type: "tool", name: "respond_with_actions" },
          }),
        });
      } else if (selectedModel.startsWith("grok")) {
        // xAI API with structured output enforcement
        console.log(`Using Grok model ${modelName} with structured output enforcement`);
        
        const messages = [
          { role: "system", content: systemPrompt },
          ...conversationForLLM.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        ];

        llmResponse = await fetch(apiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            messages,
            max_tokens: maxTokens,
            temperature: 0.7,
            response_format: generateGrokSchema(manifest, exposeProject),
          }),
        });
      }

      // Capture API response status for logging
      const apiResponseStatus = llmResponse?.status || null;

      if (!llmResponse?.ok) {
        const errorText = await llmResponse?.text();
        console.error("LLM API error:", llmResponse?.status, errorText);

        // Log the failed API call
        await supabase.rpc("insert_agent_llm_log_with_token", {
          p_session_id: sessionId,
          p_project_id: projectId,
          p_token: shareToken,
          p_iteration: iteration,
          p_model: selectedModel,
          p_input_prompt: fullInputPrompt,
          p_output_raw: errorText,
          p_was_parse_success: false,
          p_parse_error_message: `API error: ${llmResponse?.status}`,
          p_api_response_status: apiResponseStatus,
        });

        if (llmResponse?.status === 429) {
          throw new Error("Rate limit exceeded. Please try again later.");
        }
        if (llmResponse?.status === 402) {
          throw new Error("Payment required. Please add credits to your API account.");
        }

        throw new Error(`LLM API error: ${errorText}`);
      }

      const llmData = await llmResponse.json();
      console.log("LLM response received");

      // Extract raw output text BEFORE parsing (for logging)
      let rawOutputText = "";
      if (selectedModel.startsWith("gemini")) {
        rawOutputText = llmData.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(llmData);
      } else if (selectedModel.startsWith("claude")) {
        const toolUseBlock = llmData.content?.find((block: any) => block.type === "tool_use");
        const textBlock = llmData.content?.find((block: any) => block.type === "text");
        rawOutputText = toolUseBlock 
          ? JSON.stringify(toolUseBlock.input, null, 2) 
          : (textBlock?.text || JSON.stringify(llmData.content));
      } else if (selectedModel.startsWith("grok")) {
        rawOutputText = llmData.choices?.[0]?.message?.content || JSON.stringify(llmData);
      }

      // Parse LLM response
      let agentResponse: any;
      let wasParseSuccess = true;
      let parseErrorMessage: string | null = null;

      try {
        if (selectedModel.startsWith("gemini")) {
          const text = llmData.candidates[0].content.parts[0].text as string;
          agentResponse = parseAgentResponseText(text);
        } else if (selectedModel.startsWith("claude")) {
          // With strict tool use, response comes in tool_use block's input field
          const toolUseBlock = llmData.content.find((block: any) => block.type === "tool_use");
          if (toolUseBlock && toolUseBlock.input) {
            // Tool input is already structured JSON, use directly
            agentResponse = toolUseBlock.input;
            console.log("Claude strict tool use response parsed directly");
          } else {
            // Fallback: try text content with robust parser
            const textBlock = llmData.content.find((block: any) => block.type === "text");
            const text = textBlock?.text || JSON.stringify(llmData.content);
            console.warn("No tool_use block found, falling back to text parsing");
            agentResponse = parseAgentResponseText(text);
          }
        } else if (selectedModel.startsWith("grok")) {
          const text = llmData.choices[0].message.content as string;
          agentResponse = parseAgentResponseText(text);
        }

        // Check if parsing actually failed (parse_error status)
        if (agentResponse?.status === "parse_error") {
          wasParseSuccess = false;
          parseErrorMessage = "Failed to parse agent response as JSON";
        }
      } catch (parseError: any) {
        wasParseSuccess = false;
        parseErrorMessage = parseError.message || "Unknown parse error";
        agentResponse = {
          reasoning: "Failed to parse agent response as JSON. Raw output preserved.",
          raw_output: rawOutputText.slice(0, 2000),
          operations: [],
          status: "parse_error",
        };
      }

      // Log the LLM call to agent_llm_logs
      await supabase.rpc("insert_agent_llm_log_with_token", {
        p_session_id: sessionId,
        p_project_id: projectId,
        p_token: shareToken,
        p_iteration: iteration,
        p_model: selectedModel,
        p_input_prompt: fullInputPrompt,
        p_output_raw: rawOutputText,
        p_was_parse_success: wasParseSuccess,
        p_parse_error_message: parseErrorMessage,
        p_api_response_status: apiResponseStatus,
      });
      console.log(`[LLM LOG] Iteration ${iteration} logged, parse success: ${wasParseSuccess}`);

      console.log("Parsed agent response:", agentResponse);

      // Ensure operations is an array, not a string (handles double-encoded JSON)
      if (agentResponse && typeof agentResponse.operations === 'string') {
        try {
          agentResponse.operations = JSON.parse(agentResponse.operations);
          console.log("Parsed operations from string");
        } catch (e) {
          console.warn('Failed to parse operations string:', e);
          agentResponse.operations = [];
        }
      }
      if (agentResponse && !Array.isArray(agentResponse.operations)) {
        console.warn('Operations is not an array, defaulting to []:', typeof agentResponse.operations);
        agentResponse.operations = [];
      }

      // Log agent response to database
      await supabase.rpc("insert_agent_message_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_role: "agent",
        p_content: JSON.stringify({
          reasoning: agentResponse.reasoning,
          operations: agentResponse.operations,
          status: agentResponse.status,
          blackboard_entry: agentResponse.blackboard_entry || null,
        }),
        p_metadata: { iteration },
      });
      
      // Broadcast to notify subscribers immediately after each iteration
      await supabase.channel(`agent-messages-project-${projectId}`).send({
        type: 'broadcast',
        event: 'agent_message_refresh',
        payload: { sessionId, iteration }
      });
      console.log(`[BROADCAST] Sent agent_message_refresh for iteration ${iteration}`);

      // Add blackboard entry
      if (agentResponse.blackboard_entry) {
        await supabase.rpc("add_blackboard_entry_with_token", {
          p_session_id: session.id,
          p_entry_type: agentResponse.blackboard_entry.entry_type,
          p_content: agentResponse.blackboard_entry.content,
          p_token: shareToken,
        });
      }

      // Execute operations
      const operationResults = [];
      let filesChanged = false;

      // Sort edit_lines operations by start_line DESCENDING (back-to-front) to prevent line number corruption
      // When multiple edits target the same file, editing from the end first preserves earlier line numbers
      const operations = [...(agentResponse.operations || [])];
      const editsByFile = new Map<string, any[]>();
      const nonEditOps: any[] = [];

      for (const op of operations) {
        // Handle malformed operations: convert _param_keys/params_summary to params for parameterless ops
        const hasMalformedParams = op && !op.params && ((op as any)._param_keys !== undefined || (op as any).params_summary !== undefined);
        if (hasMalformedParams) {
          const parameterlessOps = ['list_files', 'get_staged_changes', 'discard_all_staged'];
          if (parameterlessOps.includes(op.type)) {
            console.log(`[AGENT] Converting malformed params to params for parameterless operation: ${op.type}`);
            op.params = {} as any;
            if (op.type === 'list_files') {
              op.params.path_prefix = null;
            }
          } else {
            console.warn(`[AGENT] Cannot infer params from _param_keys/params_summary for operation: ${op.type}`);
          }
        }
        
        // Skip invalid operations without params entirely - do NOT add to processing list
        if (!op || !op.params) {
          console.warn(`[AGENT] Skipping invalid operation (missing params):`, JSON.stringify({ type: op?.type, has_malformed_params: hasMalformedParams }));
          continue;
        }
        if (op.type === 'edit_lines') {
          const fileId = op.params.file_id;
          if (!editsByFile.has(fileId)) editsByFile.set(fileId, []);
          editsByFile.get(fileId)!.push(op);
        } else {
          nonEditOps.push(op);
        }
      }

      // Build final operations list: non-edits first, then edits sorted back-to-front per file
      const sortedOperations: any[] = [...nonEditOps];
      for (const [fileId, edits] of editsByFile) {
        // Sort by start_line DESCENDING (highest first = back-to-front)
        edits.sort((a, b) => b.params.start_line - a.params.start_line);

        // Detect and skip overlapping edits (after sorting, check if current end_line >= next start_line)
        let lastStartLine = Infinity;
        for (const edit of edits) {
          if (edit.params.end_line >= lastStartLine) {
            console.warn(`[AGENT] Skipping overlapping edit for file ${fileId}: ` +
              `lines ${edit.params.start_line}-${edit.params.end_line} overlaps with edit starting at line ${lastStartLine}`);
            continue; // Skip overlapping edit
          }
          lastStartLine = edit.params.start_line;
          sortedOperations.push(edit);
        }
      }

      console.log(`[AGENT] Executing ${sortedOperations.length} operations (${editsByFile.size} files with edits, sorted back-to-front)`);

      for (const op of sortedOperations) {
        console.log("Executing operation:", op.type);

        // Log operation start
        const { data: logEntry } = await supabase.rpc("log_agent_operation_with_token", {
          p_session_id: session.id,
          p_operation_type: op.type,
          p_file_path: op.params.path || op.params.file_path || null,
          p_status: "in_progress",
          p_details: op.params,
          p_token: shareToken,
        });

        // Broadcast operation started
        await supabase.channel(`agent-operations-project-${projectId}`).send({
          type: 'broadcast',
          event: 'agent_operation_refresh',
          payload: { sessionId: session.id, operationId: logEntry?.id, status: 'in_progress' }
        });

        try {
          let result;

          switch (op.type) {
            case "list_files":
              result = await supabase.rpc("get_repo_file_paths_with_token", {
                p_repo_id: repoId,
                p_token: shareToken,
                p_path_prefix: op.params.path_prefix || null,
              });
              
              // Merge session registry to ensure current staging IDs for session-created files
              if (result.data && Array.isArray(result.data)) {
                for (const [filePath, info] of sessionFileRegistry) {
                  const existingIdx = result.data.findIndex((f: any) => f.path === filePath);
                  if (existingIdx >= 0) {
                    // Update with session's known ID (most recent)
                    console.log(`[SESSION] Updating list_files result for ${filePath} with session-tracked ID: ${info.staging_id}`);
                    result.data[existingIdx].id = info.staging_id;
                    result.data[existingIdx].is_staged = true;
                    result.data[existingIdx].operation_type = 'add';
                    result.data[existingIdx].session_tracked = true;
                  }
                }
              }
              break;

            case "search":
              result = await supabase.rpc("search_file_content_with_token", {
                p_repo_id: repoId,
                p_search_term: op.params.keyword,
                p_token: shareToken,
              });
              break;

            case "wildcard_search":
              result = await supabase.rpc("wildcard_search_files_with_token", {
                p_repo_id: repoId,
                p_query: op.params.query || "",
                p_token: shareToken,
              });
              // Strip content from wildcard_search results - agent should use read_file if needed
              if (result.data && Array.isArray(result.data)) {
                result.data = result.data.map((item: any) => ({
                  id: item.id,
                  path: item.path,
                  match_count: item.match_count,
                  matched_terms: item.matched_terms,
                  is_staged: item.is_staged,
                }));
              }
              break;

            case "read_file":
              // PATH-FIRST RESOLUTION: Resolve file ID upfront before any RPC calls
              const readPath = op.params.path;
              let readFileId = op.params.file_id;
              let resolvedReadPath: string | null = null;
              
              // 1. Try path in session registry first
              if (readPath && sessionFileRegistry.has(readPath)) {
                const entry = sessionFileRegistry.get(readPath)!;
                readFileId = entry.staging_id;
                resolvedReadPath = entry.path;
                console.log(`[SESSION] read_file: Found ${readPath} in session registry with ID ${readFileId}`);
              }
              
              // 2. Try path in staging (if not found in registry)
              if (!resolvedReadPath && readPath) {
                const { data: stagedCheck } = await supabase.rpc("get_staged_changes_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                });
                const matchedStaged = stagedCheck?.find((s: any) => s.file_path === readPath);
                if (matchedStaged) {
                  readFileId = matchedStaged.id;
                  resolvedReadPath = matchedStaged.file_path;
                  console.log(`[SESSION] read_file: Found ${readPath} in staging with ID ${readFileId}`);
                }
              }
              
              // 3. Try path in repo_files (committed files)
              if (!resolvedReadPath && readPath) {
                const { data: repoFiles } = await supabase.rpc("get_repo_file_paths_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                  p_path_prefix: null,
                });
                const matchedFile = repoFiles?.find((f: any) => f.path === readPath);
                if (matchedFile) {
                  readFileId = matchedFile.id;
                  resolvedReadPath = matchedFile.path;
                  console.log(`[SESSION] read_file: Found ${readPath} in repo_files with ID ${readFileId}`);
                }
              }
              
              // 4. If we still don't have an ID, fail with helpful error
              if (!readFileId) {
                throw new Error(`File not found: ${readPath || 'no path or file_id provided'}`);
              }
              
              // Now make the RPC call with resolved ID
              result = await supabase.rpc("get_file_content_with_token", {
                p_file_id: readFileId,
                p_token: shareToken,
              });
              
              // Update registry if resolution worked (for future lookups)
              if (!result.error && result.data?.[0] && resolvedReadPath) {
                sessionFileRegistry.set(resolvedReadPath, {
                  staging_id: readFileId,
                  path: resolvedReadPath,
                  content: result.data[0].content,
                  created_at: new Date(),
                });
              }

              // Add line numbers to content for LLM clarity
              if (result.data?.[0]?.content) {
                const lines = result.data[0].content.split("\n");
                const numberedContent = lines.map((line: string, idx: number) => `<<${idx + 1}>> ${line}`).join("\n");

                result.data[0].numbered_content = numberedContent;
                result.data[0].total_lines = lines.length;
                // Replace content with numbered version for agent consumption
                result.data[0].content = numberedContent;
              }
              break;

            case "edit_lines":
              // PATH-FIRST RESOLUTION: Resolve file ID upfront before any RPC calls
              const editPath = op.params.path;
              let editFileId = op.params.file_id;
              let resolvedEditPath: string | null = null;
              
              // 1. Try path in session registry first
              if (editPath && sessionFileRegistry.has(editPath)) {
                const entry = sessionFileRegistry.get(editPath)!;
                editFileId = entry.staging_id;
                resolvedEditPath = entry.path;
                console.log(`[SESSION] edit_lines: Found ${editPath} in session registry with ID ${editFileId}`);
              }
              
              // 2. Try path in staging (if not found in registry)
              if (!resolvedEditPath && editPath) {
                const { data: stagedCheck } = await supabase.rpc("get_staged_changes_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                });
                const matchedStaged = stagedCheck?.find((s: any) => s.file_path === editPath);
                if (matchedStaged) {
                  editFileId = matchedStaged.id;
                  resolvedEditPath = matchedStaged.file_path;
                  console.log(`[SESSION] edit_lines: Found ${editPath} in staging with ID ${editFileId}`);
                }
              }
              
              // 3. Try path in repo_files (committed files)
              if (!resolvedEditPath && editPath) {
                const { data: repoFiles } = await supabase.rpc("get_repo_file_paths_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                  p_path_prefix: null,
                });
                const matchedFile = repoFiles?.find((f: any) => f.path === editPath);
                if (matchedFile) {
                  editFileId = matchedFile.id;
                  resolvedEditPath = matchedFile.path;
                  console.log(`[SESSION] edit_lines: Found ${editPath} in repo_files with ID ${editFileId}`);
                }
              }
              
              // 4. If we still don't have an ID, fail with helpful error
              if (!editFileId) {
                throw new Error(`File not found: ${editPath || 'no path or file_id provided'}`);
              }
              
              // Read file using function that checks both repo_files and repo_staging
              console.log(`[AGENT] edit_lines: Reading file ${editFileId} (resolved from path: ${resolvedEditPath || editPath || 'N/A'})`);
              let fileData: any[] | null = null;
              let readError: any = null;
              
              const readResult = await supabase.rpc("get_file_content_with_token", {
                p_file_id: editFileId,
                p_token: shareToken,
              });
              fileData = readResult.data;
              readError = readResult.error;

              if (readError) {
                console.error(`[AGENT] edit_lines: Read error:`, readError);
                throw new Error(`Failed to read file ${editPath || editFileId}: ${readError.message}`);
              }

              if (!fileData || fileData.length === 0) {
                console.error(`[AGENT] edit_lines: File not found: ${editPath || editFileId}`);
                throw new Error(
                  `File not found: ${editPath || editFileId}. Cannot edit. The file may not exist or may have been deleted.`,
                );
              }

              console.log(
                `[AGENT] edit_lines: File found: ${fileData[0].path}, content length: ${fileData[0].content?.length || 0}`,
              );

              if (fileData?.[0]) {
                // get_file_content_with_token already returns staged content via COALESCE overlay
                // No need to separately fetch staged changes - the RPC handles this
                const baseContent = fileData[0].content;

                // Validate line numbers against current content
                const baseLines = baseContent.split("\n");
                const totalBaseLines = baseLines.length;

                // Cap start_line to allow appending at end of file
                // If start_line is beyond file length, treat as append (start at last line + 1)
                let startIdx = op.params.start_line - 1;
                if (startIdx > totalBaseLines) {
                  console.log(
                    `[AGENT] edit_lines: start_line ${op.params.start_line} exceeds file length ${totalBaseLines}, capping to append position`,
                  );
                  startIdx = totalBaseLines; // Will append after last line
                }

                // Cap end_line to actual file length (allows agent to be less precise)
                let endIdx = op.params.end_line - 1;
                if (endIdx >= totalBaseLines) {
                  console.log(
                    `[AGENT] edit_lines: end_line ${op.params.end_line} exceeds file length ${totalBaseLines}, capping to ${totalBaseLines}`,
                  );
                  endIdx = totalBaseLines - 1;
                }

                // Only validate that start_line is not negative
                if (startIdx < 0) {
                  throw new Error(
                    `Invalid start line: start_line=${op.params.start_line}. ` +
                      `Line numbers must be positive (1 or greater).`,
                  );
                }

                // INSERT operation: when start > end (e.g., start=10, end=9),
                // this means "insert at position 10 with 0 deletions"
                // The splice below handles this correctly: splice(startIdx, 0, ...newContentLines)
                if (startIdx > endIdx && startIdx < totalBaseLines) {
                  console.log(
                    `[AGENT] edit_lines: INSERT operation (start ${startIdx + 1} > end ${endIdx + 1}), ` +
                      `inserting at line ${startIdx + 1} with 0 deletions`,
                  );
                }

                // Now check for pure append (when start is BEYOND file length)
                // This only triggers when startIdx >= totalBaseLines (truly appending after last line)
                if (startIdx >= totalBaseLines) {
                  console.log(
                    `[AGENT] edit_lines: Pure append operation detected (start ${startIdx + 1} beyond file length ${totalBaseLines}), appending to end of file`,
                  );
                  // Append: splice at totalBaseLines with 0 deletions
                  startIdx = totalBaseLines;
                  endIdx = totalBaseLines - 1; // Will result in 0 deletions
                }

                // Apply edit to the correct base content
                // Strip any accidental <<N>> markers from new_content (agent shouldn't include them, but safeguard)
                let cleanedNewContent = op.params.new_content.replace(/^<<\d+>>\s*/gm, "");

                // Split new_content into lines (agent provides content with \n separators)
                const newContentLines = cleanedNewContent.split("\n");
                // Remove trailing empty line if new_content ended with \n
                if (newContentLines.length > 0 && newContentLines[newContentLines.length - 1] === "") {
                  newContentLines.pop();
                }

                // Calculate how many lines to remove (0 for pure append)
                const linesToRemove = startIdx > endIdx ? 0 : endIdx - startIdx + 1;
                baseLines.splice(startIdx, linesToRemove, ...newContentLines);
                let finalContent = baseLines.join("\n");
                let jsonParseWarning: string | undefined;

                // For JSON files, validate and normalize the result to avoid structural issues like duplicate keys
                const isJsonFile = fileData[0].path.endsWith(".json");
                if (isJsonFile) {
                  try {
                    const parsed = JSON.parse(finalContent);
                    // Re-stringify to canonical JSON (no duplicate keys, consistent formatting)
                    finalContent = JSON.stringify(parsed, null, 2) + "\n";
                  } catch (parseError: any) {
                    // Allow invalid JSON edits to be staged - agent may need multiple iterations to fix complex issues
                    // Log the error but don't fail the operation
                    console.warn(
                      `Warning: Edit resulted in invalid JSON for ${fileData[0].path}. ` +
                        `Lines ${op.params.start_line}-${op.params.end_line}. ` +
                        `Error: ${parseError?.message || String(parseError)}. ` +
                        `Staging anyway to allow iterative fixes.`,
                    );
                    // Store warning to include in result after RPC call
                    jsonParseWarning = parseError?.message || String(parseError);
                  }
                }

                // Stage the change (UPSERT will preserve original old_content baseline)
                console.log(
                  `[AGENT] edit_lines: Staging edit for ${fileData[0].path}, lines ${op.params.start_line}-${op.params.end_line}`,
                );
                result = await supabase.rpc("stage_file_change_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                  p_operation_type: "edit",
                  p_file_path: fileData[0].path,
                  p_old_content: fileData[0].content,
                  p_new_content: finalContent,
                });

                if (result.error) {
                  console.error(`[AGENT] edit_lines: Staging failed:`, result.error);
                  throw new Error(`Failed to stage edit: ${result.error.message}`);
                }

                console.log(`[AGENT] edit_lines: Successfully staged edit for ${fileData[0].path}`, {
                  staging_id: result.data?.id,
                  operation_type: "edit",
                  file_path: fileData[0].path,
                });
                
                // Update session registry with new staging ID and content after edit
                if (result.data?.id) {
                  sessionFileRegistry.set(fileData[0].path, {
                    staging_id: result.data.id,
                    path: fileData[0].path,
                    content: finalContent,
                    created_at: new Date(),
                  });
                  console.log(`[SESSION] Updated registry for ${fileData[0].path} after edit with ID: ${result.data.id}`);
                }

                // CRITICAL: Re-read the file after edit to verify the change was applied correctly
                // Use the new staging ID from the result for verification
                const verifyFileId = result.data?.id || editFileId;
                const { data: verifyData, error: verifyError } = await supabase.rpc("get_file_content_with_token", {
                  p_file_id: verifyFileId,
                  p_token: shareToken,
                });

                let verificationInfo = null;
                if (verifyError) {
                  console.warn(`[AGENT] edit_lines: Could not verify edit:`, verifyError);
                } else if (verifyData && verifyData.length > 0) {
                  const verifiedContent = verifyData[0].content;
                  const verifiedLines = verifiedContent.split("\n");
                  console.log(
                    `[AGENT] edit_lines: Verified file now has ${verifiedLines.length} lines (was ${totalBaseLines} lines before edit)`,
                  );

                // Return ENTIRE file content after edit so agent can verify the complete result
                  const numberedVerifiedContent = verifiedLines
                    .map((line: string, idx: number) => `<<${idx + 1}>> ${line}`)
                    .join("\n");

                  verificationInfo = {
                    lines_before: totalBaseLines,
                    lines_after: verifiedLines.length,
                    full_content: numberedVerifiedContent,
                  };
                }

                // Return ENTIRE file content so agent sees exactly what was staged
                const finalLines = finalContent.split("\n");
                const numberedFinalContent = finalLines
                  .map((line: string, idx: number) => `<<${idx + 1}>> ${line}`)
                  .join("\n");

                result.data = {
                  ...(result.data || {}),
                  full_content: numberedFinalContent,
                  total_lines: finalLines.length,
                  verification: verificationInfo,
                };

                // Add JSON parse warning if there was one
                if (jsonParseWarning) {
                  result.data.json_parse_warning = jsonParseWarning;
                }
              }
              break;

            case "create_file":
              result = await supabase.rpc("stage_file_change_with_token", {
                p_repo_id: repoId,
                p_token: shareToken,
                p_operation_type: "add",
                p_file_path: op.params.path,
                p_old_content: "", // Empty string for new files, not NULL
                p_new_content: op.params.content,
              });
              
              // Register newly created file in session registry for future operations
              if (result.data?.id) {
                sessionFileRegistry.set(op.params.path, {
                  staging_id: result.data.id,
                  path: op.params.path,
                  content: op.params.content,
                  created_at: new Date(),
                });
                console.log(`[SESSION] Registered new file ${op.params.path} with staging ID: ${result.data.id}`);
                
                // Return the staging ID to the agent for reference
                result.data.file_id = result.data.id;
                result.data.path = op.params.path;
                result.data.session_tracked = true;
              }
              break;

            case "delete_file":
              // Path-first resolution: try path -> session registry -> staging -> repo_files -> file_id
              const deletePath = op.params.path;
              let deleteFileId = op.params.file_id;
              let deleteFilePath: string | null = null;
              let deleteFileContent: string | null = null;
              
              // 1. Try path in session registry
              if (deletePath && sessionFileRegistry.has(deletePath)) {
                const entry = sessionFileRegistry.get(deletePath)!;
                deleteFileId = entry.staging_id;
                deleteFilePath = entry.path;
                deleteFileContent = entry.content;
                console.log(`[SESSION] delete_file: Found ${deletePath} in session registry with ID ${deleteFileId}`);
              }
              
              // 2. Try path in staging
              if (!deleteFilePath && deletePath) {
                const { data: stagedCheck } = await supabase.rpc("get_staged_changes_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                });
                const matchedStaged = stagedCheck?.find((s: any) => s.file_path === deletePath);
                if (matchedStaged) {
                  deleteFileId = matchedStaged.id;
                  deleteFilePath = matchedStaged.file_path;
                  deleteFileContent = matchedStaged.new_content || matchedStaged.old_content;
                  console.log(`[SESSION] delete_file: Found ${deletePath} in staging with ID ${deleteFileId}`);
                }
              }
              
              // 3. Try path in repo_files (committed files)
              if (!deleteFilePath && deletePath) {
                const { data: repoFiles } = await supabase.rpc("get_repo_file_paths_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                  p_path_prefix: null,
                });
                const matchedFile = repoFiles?.find((f: any) => f.path === deletePath);
                if (matchedFile) {
                  deleteFileId = matchedFile.id;
                  deleteFilePath = matchedFile.path;
                  console.log(`[SESSION] delete_file: Found ${deletePath} in repo_files with ID ${deleteFileId}`);
                }
              }
              
              // 4. Fallback to file_id if path resolution failed
              if (!deleteFilePath && deleteFileId) {
                const { data: deleteFileData } = await supabase.rpc("get_file_content_with_token", {
                  p_file_id: deleteFileId,
                  p_token: shareToken,
                });
                if (deleteFileData?.[0]) {
                  deleteFilePath = deleteFileData[0].path;
                  deleteFileContent = deleteFileData[0].content;
                  console.log(`[SESSION] delete_file: Resolved file_id ${deleteFileId} to path ${deleteFilePath}`);
                }
              }
              
              if (!deleteFilePath) {
                throw new Error(`File not found: ${deletePath || deleteFileId}`);
              }
              
              // Now perform the delete
              const { data: stagedForDelete } = await supabase.rpc("get_staged_changes_with_token", {
                p_repo_id: repoId,
                p_token: shareToken,
              });
              const newlyCreatedDelete = stagedForDelete?.find(
                (s: any) => s.file_path === deleteFilePath && s.operation_type === "add",
              );

              if (newlyCreatedDelete) {
                // Just unstage the add operation instead of staging a delete
                result = await supabase.rpc("unstage_file_with_token", {
                  p_repo_id: repoId,
                  p_file_path: newlyCreatedDelete.file_path,
                  p_token: shareToken,
                });
                // Remove from session registry
                if (sessionFileRegistry.has(newlyCreatedDelete.file_path)) {
                  sessionFileRegistry.delete(newlyCreatedDelete.file_path);
                  console.log(`[SESSION] Removed ${newlyCreatedDelete.file_path} from registry after delete`);
                }
                console.log(`[AGENT] Unstaged newly created file: ${newlyCreatedDelete.file_path}`);
              } else {
                // Stage the delete for a committed file - need to fetch content if we don't have it
                if (!deleteFileContent) {
                  const { data: contentData } = await supabase.rpc("get_file_content_with_token", {
                    p_file_id: deleteFileId,
                    p_token: shareToken,
                  });
                  deleteFileContent = contentData?.[0]?.content || '';
                }
                result = await supabase.rpc("stage_file_change_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                  p_operation_type: "delete",
                  p_file_path: deleteFilePath,
                  p_old_content: deleteFileContent,
                });
                console.log(`[AGENT] Staged delete for committed file: ${deleteFilePath}`);
              }
              break;

            case "move_file":
              // Path-first resolution: try path -> session registry -> staging -> repo_files -> file_id
              const movePath = op.params.path;
              let moveFileId = op.params.file_id;
              let moveFilePath: string | null = null;
              let moveFileContent: string | null = null;
              
              // 1. Try path in session registry
              if (movePath && sessionFileRegistry.has(movePath)) {
                const entry = sessionFileRegistry.get(movePath)!;
                moveFileId = entry.staging_id;
                moveFilePath = entry.path;
                moveFileContent = entry.content;
                console.log(`[SESSION] move_file: Found ${movePath} in session registry with ID ${moveFileId}`);
              }
              
              // 2. Try path in staging
              if (!moveFilePath && movePath) {
                const { data: stagedCheck } = await supabase.rpc("get_staged_changes_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                });
                const matchedStaged = stagedCheck?.find((s: any) => s.file_path === movePath);
                if (matchedStaged) {
                  moveFileId = matchedStaged.id;
                  moveFilePath = matchedStaged.file_path;
                  moveFileContent = matchedStaged.new_content || matchedStaged.old_content;
                  console.log(`[SESSION] move_file: Found ${movePath} in staging with ID ${moveFileId}`);
                }
              }
              
              // 3. Try path in repo_files (committed files)
              if (!moveFilePath && movePath) {
                const { data: repoFiles } = await supabase.rpc("get_repo_file_paths_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                  p_path_prefix: null,
                });
                const matchedFile = repoFiles?.find((f: any) => f.path === movePath);
                if (matchedFile) {
                  moveFileId = matchedFile.id;
                  moveFilePath = matchedFile.path;
                  console.log(`[SESSION] move_file: Found ${movePath} in repo_files with ID ${moveFileId}`);
                }
              }
              
              // 4. Fallback to file_id if path resolution failed
              if (!moveFilePath && moveFileId) {
                const { data: moveFileData } = await supabase.rpc("get_file_content_with_token", {
                  p_file_id: moveFileId,
                  p_token: shareToken,
                });
                if (moveFileData?.[0]) {
                  moveFilePath = moveFileData[0].path;
                  moveFileContent = moveFileData[0].content;
                  console.log(`[SESSION] move_file: Resolved file_id ${moveFileId} to path ${moveFilePath}`);
                }
              }
              
              if (!moveFilePath) {
                throw new Error(`File not found: ${movePath || moveFileId}`);
              }
              
              // Now perform the move
              const { data: stagedForMove } = await supabase.rpc("get_staged_changes_with_token", {
                p_repo_id: repoId,
                p_token: shareToken,
              });
              const newlyCreatedMove = stagedForMove?.find(
                (s: any) => s.file_path === moveFilePath && s.operation_type === "add",
              );

              if (newlyCreatedMove) {
                const oldPath = moveFilePath;
                // For staged "add" files, just update the staging record's file_path
                result = await supabase.rpc("update_staged_file_path_with_token", {
                  p_staging_id: newlyCreatedMove.id,
                  p_new_path: op.params.new_path,
                  p_token: shareToken,
                });
                
                // Update session registry with new path
                if (sessionFileRegistry.has(oldPath)) {
                  const existingEntry = sessionFileRegistry.get(oldPath)!;
                  sessionFileRegistry.delete(oldPath);
                  sessionFileRegistry.set(op.params.new_path, {
                    ...existingEntry,
                    path: op.params.new_path,
                  });
                  console.log(`[SESSION] Updated registry: ${oldPath} -> ${op.params.new_path}`);
                }
                console.log(`[AGENT] Moved staged file from ${oldPath} to ${op.params.new_path}`);
              } else {
                // For committed files, use the existing move logic
                result = await supabase.rpc("move_file_with_token", {
                  p_file_id: moveFileId,
                  p_new_path: op.params.new_path,
                  p_token: shareToken,
                });
                console.log(`[AGENT] Moved committed file from ${moveFilePath} to ${op.params.new_path}`);
              }
              break;

            case "get_staged_changes":
              result = await supabase.rpc("get_staged_changes_with_token", {
                p_repo_id: repoId,
                p_token: shareToken,
              });
              // Strip old_content and new_content from staged changes - agent should use read_file if needed
              if (result.data && Array.isArray(result.data)) {
                result.data = result.data.map((item: any) => ({
                  id: item.id,
                  file_path: item.file_path,
                  operation_type: item.operation_type,
                  is_binary: item.is_binary,
                  created_at: item.created_at,
                }));
              }
              console.log(`[AGENT] Retrieved ${result.data?.length || 0} staged changes`);
              break;

            case "unstage_file":
              result = await supabase.rpc("unstage_file_with_token", {
                p_repo_id: repoId,
                p_file_path: op.params.file_path,
                p_token: shareToken,
              });
              // Remove from session registry
              if (sessionFileRegistry.has(op.params.file_path)) {
                sessionFileRegistry.delete(op.params.file_path);
                console.log(`[SESSION] Removed ${op.params.file_path} from registry after unstage`);
              }
              filesChanged = true;
              console.log(`[AGENT] Unstaged file: ${op.params.file_path}`);
              break;

            case "discard_all_staged":
              result = await supabase.rpc("discard_staged_with_token", {
                p_repo_id: repoId,
                p_token: shareToken,
              });
              // Clear session registry since all staged changes are discarded
              sessionFileRegistry.clear();
              console.log(`[SESSION] Cleared registry after discard_all_staged`);
              filesChanged = true;
              console.log(`[AGENT] Discarded all staged changes, count: ${result.data || 0}`);
              break;

            case "project_inventory":
              if (!exposeProject) {
                throw new Error("project_inventory is not enabled. Enable 'Expose Project to Agent' in Agent Configuration.");
              }
              result = await supabase.rpc("get_project_inventory_with_token", {
                p_project_id: projectId,
                p_token: shareToken,
              });
              console.log(`[AGENT] Retrieved project inventory`);
              break;

            case "project_category":
              if (!exposeProject) {
                throw new Error("project_category is not enabled. Enable 'Expose Project to Agent' in Agent Configuration.");
              }
              result = await supabase.rpc("get_project_category_with_token", {
                p_project_id: projectId,
                p_category: op.params.category,
                p_token: shareToken,
              });
              console.log(`[AGENT] Retrieved project category: ${op.params.category}`);
              break;

            case "project_elements":
              if (!exposeProject) {
                throw new Error("project_elements is not enabled. Enable 'Expose Project to Agent' in Agent Configuration.");
              }
              result = await supabase.rpc("get_project_elements_with_token", {
                p_project_id: projectId,
                p_elements: op.params.elements,
                p_token: shareToken,
              });
              console.log(`[AGENT] Retrieved ${op.params.elements?.length || 0} project elements`);
              break;
          }

          if (result?.error) throw result.error;

          // Mark that files have changed for broadcast purposes
          if (["edit_lines", "create_file", "delete_file", "move_file", "unstage_file", "discard_all_staged"].includes(op.type)) {
            filesChanged = true;
          }

          // Update operation log to completed
          await supabase.rpc("update_agent_operation_status_with_token", {
            p_operation_id: logEntry.id,
            p_status: "completed",
            p_token: shareToken,
          });

          // Broadcast operation refresh
          await supabase.channel(`agent-operations-project-${projectId}`).send({
            type: 'broadcast',
            event: 'agent_operation_refresh',
            payload: { sessionId: session.id, operationId: logEntry.id, status: 'completed' }
          });

          operationResults.push({ type: op.type, success: true, data: result?.data });
        } catch (error) {
          console.error("Operation failed:", error);

          // Properly serialize error for display
          let errorMessage: string;
          if (error instanceof Error) {
            errorMessage = error.message;
          } else if (typeof error === "object" && error !== null) {
            // PostgreSQL errors are objects with code, message, details, hint
            errorMessage = JSON.stringify(error, null, 2);
          } else {
            errorMessage = String(error);
          }

          // Update operation log to failed
          await supabase.rpc("update_agent_operation_status_with_token", {
            p_operation_id: logEntry.id,
            p_status: "failed",
            p_error_message: errorMessage,
            p_token: shareToken,
          });

          // Broadcast operation refresh
          await supabase.channel(`agent-operations-project-${projectId}`).send({
            type: 'broadcast',
            event: 'agent_operation_refresh',
            payload: { sessionId: session.id, operationId: logEntry.id, status: 'failed' }
          });

          operationResults.push({
            type: op.type,
            success: false,
            error: errorMessage,
          });
        }
      }

      // If any file changes occurred in this iteration, broadcast refresh events
      if (filesChanged) {
        try {
          // Broadcast staging_refresh for local runner
          const stagingChannel = supabase.channel(`repo-staging-${repoId}`);
          await stagingChannel.subscribe();
          await stagingChannel.send({
            type: "broadcast",
            event: "staging_refresh",
            payload: { repoId, action: "agent_edit", timestamp: Date.now() },
          });
          await supabase.removeChannel(stagingChannel);
          console.log(`[BROADCAST] Sent staging_refresh for repo: ${repoId}`);

          // Broadcast repo_files_refresh for Build.tsx file tree
          const filesChannel = supabase.channel(`repo-changes-${projectId}`);
          await filesChannel.subscribe();
          await filesChannel.send({
            type: "broadcast",
            event: "repo_files_refresh",
            payload: { projectId, repoId },
          });
          await supabase.removeChannel(filesChannel);
        } catch (broadcastError) {
          console.error("Failed to broadcast refresh events:", broadcastError);
        }
      }

      allOperationResults.push(...operationResults);

      // Create summary of operation results for conversation history (without large content)
      const summarizedResults = operationResults.map((r: any) => {
        const summary: any = { type: r.type, success: r.success };
        if (r.error) summary.error = r.error;
        
        // Create brief summaries instead of including full data
        if (r.success && r.data) {
          switch (r.type) {
            case "list_files":
              summary.summary = `Listed ${Array.isArray(r.data) ? r.data.length : 0} files`;
              break;
            case "wildcard_search":
              summary.summary = `Found ${Array.isArray(r.data) ? r.data.length : 0} matching files`;
              if (Array.isArray(r.data)) {
                summary.files = r.data.map((f: any) => ({ id: f.id, path: f.path, match_count: f.match_count }));
              }
              break;
            case "read_file":
              if (Array.isArray(r.data) && r.data[0]) {
                summary.summary = `Read ${r.data[0].path} (${r.data[0].total_lines || 'unknown'} lines)`;
              }
              break;
            case "get_staged_changes":
              summary.summary = `${Array.isArray(r.data) ? r.data.length : 0} staged changes`;
              if (Array.isArray(r.data)) {
                summary.files = r.data; // Already stripped of content above
              }
              break;
            case "edit_lines":
              summary.summary = `Edited file, now ${r.data?.total_lines || 'unknown'} lines`;
              break;
            case "create_file":
              summary.summary = `Created file`;
              break;
            case "delete_file":
              summary.summary = `Deleted file`;
              break;
            case "move_file":
              summary.summary = `Moved file`;
              break;
            default:
              summary.summary = `Completed ${r.type}`;
          }
        }
        return summary;
      });

      // Add ONLY the agent's response to conversation history (reasoning + operations with truncated params)
      conversationHistory.push({
        role: "assistant",
        content: JSON.stringify({
          reasoning: agentResponse.reasoning,
          operations: agentResponse.operations?.map((op: any) => {
            // Truncate params to prevent bloat but preserve correct format
            const truncatedParams: any = {};
            for (const [key, value] of Object.entries(op.params || {})) {
              if (key === 'content' || key === 'new_content') {
                // Aggressively truncate content fields (full content is in ephemeral context)
                truncatedParams[key] = typeof value === 'string' && value.length > 50 
                  ? `[${value.length} chars]` 
                  : value;
              } else if (typeof value === 'string' && value.length > 100) {
                truncatedParams[key] = value.substring(0, 100) + '...';
              } else {
                truncatedParams[key] = value;
              }
            }
            return { type: op.type, params: truncatedParams };
          }),
          status: agentResponse.status,
        }),
      });
      
      // Add brief operation summaries (NOT full results with content)
      conversationHistory.push({
        role: "user",
        content: `Operation summaries:\n${JSON.stringify(summarizedResults, null, 2)}`,
      });
      
      // Store full operation results for ephemeral injection into next iteration's prompt
      // This will be used in the system prompt context, NOT added to conversation history
      ephemeralContext = operationResults;

      // Check status to determine if we should continue
      if (agentResponse.status === "completed" || agentResponse.status === "requires_commit") {
        finalStatus = agentResponse.status === "completed" ? "completed" : "pending_commit";
        console.log(`Agent signaled completion with status: ${agentResponse.status}`);
        break;
      }

      // If status is still "in_progress", continue to next iteration
      console.log("Continuing to next iteration...");
    }

    // Update session status on completion with completed_at timestamp
    const completedAt = finalStatus === "completed" || finalStatus === "failed" ? new Date().toISOString() : null;

    await supabase.rpc("update_agent_session_status_with_token", {
      p_session_id: session.id,
      p_status: finalStatus,
      p_token: shareToken,
      p_completed_at: completedAt,
    });

    console.log("Task completed with status:", finalStatus);

    return new Response(
      JSON.stringify({
        sessionId: session.id,
        status: finalStatus,
        iterations: iteration,
        operations: allOperationResults,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in coding-agent-orchestrator:", error);

    // Update session to failed status on error if session was created
    if (sessionId && shareToken && supabase) {
      try {
        await supabase.rpc("update_agent_session_status_with_token", {
          p_session_id: sessionId,
          p_status: "failed",
          p_token: shareToken,
          p_completed_at: new Date().toISOString(),
        });
      } catch (updateError) {
        console.error("Failed to update session status on error:", updateError);
      }
    }

    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
