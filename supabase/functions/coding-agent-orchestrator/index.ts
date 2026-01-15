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
  taskDescription?: string;
  attachedFiles?: Array<{ id: string; path: string }>;
  projectContext?: any;
  shareToken: string;
  mode?: "task" | "iterative_loop" | "continuous_improvement";
  autoCommit?: boolean;
  chatHistory?: string;
  exposeProject?: boolean;
  maxIterations?: number;
  promptSections?: AgentPromptSection[];
  customToolDescriptions?: CustomToolDescriptions;
  // New: support for continuation
  sessionId?: string;
  iteration?: number;
}

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

  // Clean up common LLM mistakes: XML-like parameter tags in JSON
  const cleanXmlTags = (str: string): string => {
    // Remove patterns like: "\n<parameter name=\"entry_type\">reflection", "content": "..."
    // Replace with proper JSON object
    return str
      .replace(/"blackboard_entry":\s*"\s*\\n<parameter[^"]*"?\s*,\s*"content":\s*"([^"]*)"/g, 
        (_, content) => `"blackboard_entry": {"entry_type": "progress", "content": "${content}"}`)
      .replace(/<parameter[^>]*>[^<]*<\/parameter>/g, '')
      .replace(/<parameter[^>]*>/g, '')
      .replace(/<\/parameter>/g, '');
  };

  let result = tryParse(text, "direct parse");
  if (result) return normalizeAgentResponse(result);

  // Try after cleaning XML tags
  const xmlCleaned = cleanXmlTags(text);
  result = tryParse(xmlCleaned, "xml-cleaned parse");
  if (result) return normalizeAgentResponse(result);

  const lastFenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```[\s\S]*$/i);
  if (lastFenceMatch?.[1]) {
    const extracted = lastFenceMatch[1].trim();
    const cleaned = extracted
      .replace(/^[\s\n]*here.?is.?the.?json.?[:\s]*/i, "")
      .replace(/^[\s\n]*json[:\s]*/i, "")
      .trim();
    result = tryParse(cleaned, "last code fence");
    if (result) return normalizeAgentResponse(result);
    
    // Try with XML cleaning
    result = tryParse(cleanXmlTags(cleaned), "last code fence (xml-cleaned)");
    if (result) return normalizeAgentResponse(result);
  }

  const allFences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (let i = allFences.length - 1; i >= 0; i--) {
    const content = allFences[i][1].trim();
    if (content) {
      result = tryParse(content, `code fence #${i + 1} (reverse)`);
      if (result) return normalizeAgentResponse(result);
    }
  }

  const firstBrace = originalText.indexOf("{");
  const lastBrace = originalText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = originalText.slice(firstBrace, lastBrace + 1);
    result = tryParse(candidate, "brace extraction (raw)");
    if (result) return normalizeAgentResponse(result);

    // Try with XML cleaning
    result = tryParse(cleanXmlTags(candidate), "brace extraction (xml-cleaned)");
    if (result) return normalizeAgentResponse(result);

    const cleaned = candidate
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    result = tryParse(cleaned, "brace extraction (cleaned)");
    if (result) return normalizeAgentResponse(result);
  }

  const heuristicMatch = originalText.match(/(\{(?:[^{}]|"(?:\\.|[^"\\])*")*\})/);
  if (heuristicMatch) {
    result = tryParse(heuristicMatch[1], "heuristic object match");
    if (result) return normalizeAgentResponse(result);
  }

  console.error("All JSON parsing methods failed for response:", originalText.slice(0, 1000));
  return {
    reasoning: "Failed to parse agent response as JSON. Raw output preserved.",
    raw_output: originalText.slice(0, 2000),
    operations: [],
    status: "parse_error",
  };
}

// Normalize agent response to ensure blackboard_entry is a proper object
function normalizeAgentResponse(response: any): any {
  if (typeof response.blackboard_entry === 'string') {
    // Try to extract content from malformed string
    const contentMatch = response.blackboard_entry.match(/content[":>\s]+(.+)/i);
    response.blackboard_entry = {
      entry_type: "progress",
      content: contentMatch ? contentMatch[1].trim() : response.blackboard_entry
    };
  } else if (response.blackboard_entry && !response.blackboard_entry.entry_type) {
    response.blackboard_entry.entry_type = "progress";
  }
  return response;
}

function generateToolsListText(manifest: ToolsManifest, exposeProject: boolean): string {
  const lines: string[] = [];
  
  lines.push("## FILE OPERATIONS\n");
  lines.push("You work by executing available tools to manipulate files in the project repository. Each tool has specific parameters you must provide. You can call one or more tools at a time. Always call as many tools as practical for each iteration.\n");
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
  
  if (exposeProject) {
    lines.push("\n## PROJECT EXPLORATION TOOLS (READ-ONLY)\n");
    lines.push("In addition to the repository files, you have READ-ONLY access to explore the entire project via these additional tools:\n");
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
    lines.push("\nWhen you need to retrieve an element from the project, you can follow this workflow:");
    lines.push("1. Start with project_inventory to see counts and previews of all categories");
    lines.push("2. Use project_category to load full details of categories you need");
    lines.push("3. Use project_elements to fetch specific items by ID");
    lines.push("\nThese tools are READ-ONLY. Use them to understand context and inform your file operations.");
  }
  
  return lines.join("\n");
}

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
  "status": "in_progress" | "completed"
}

Available operation types: ${allToolNames.join(", ")}`;
}

function generateGrokSchema(manifest: ToolsManifest, exposeProject: boolean) {
  const allToolNames = [
    ...Object.keys(manifest.file_operations),
    ...(exposeProject ? Object.keys(manifest.project_exploration_tools) : [])
  ];
  
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
            enum: ["in_progress", "completed"],
          },
        },
        required: ["reasoning", "operations", "status", "blackboard_entry"],
      },
    },
  };
}

function generateClaudeSchema(manifest: ToolsManifest, exposeProject: boolean) {
  const allToolNames = [
    ...Object.keys(manifest.file_operations),
    ...(exposeProject ? Object.keys(manifest.project_exploration_tools) : [])
  ];
  
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
          enum: ["in_progress", "completed"],
        },
      },
      required: ["reasoning", "operations", "status", "blackboard_entry"],
      additionalProperties: false,
    },
  };
}

type SSEEventType = 
  | 'session_created'
  | 'llm_streaming'
  | 'llm_complete'
  | 'operation_start'
  | 'operation_complete'
  | 'iteration_complete'
  | 'error';

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Parse request
  let requestData: TaskRequest;
  try {
    requestData = await req.json();
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Invalid JSON in request body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const authHeader = req.headers.get("authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });

  const shareToken = requestData.shareToken;
  const {
    projectId,
    repoId,
    taskDescription,
    attachedFiles = [],
    projectContext,
    mode = "task",
    autoCommit = false,
    chatHistory,
    exposeProject = false,
    maxIterations: requestedMaxIterations = 100,
    promptSections,
    customToolDescriptions,
    sessionId: existingSessionId,
    iteration: requestedIteration = 1,
  } = requestData;

  const isNewSession = !existingSessionId;
  const iteration = requestedIteration;

  console.log(`CodingAgent: ${isNewSession ? 'NEW' : 'CONTINUE'} session, iteration ${iteration}`);

  // Validate project access
  let project: any;
  try {
    const { data, error: projectError } = await supabase.rpc("get_project_with_token", {
      p_project_id: projectId,
      p_token: shareToken,
    });
    if (projectError) throw projectError;
    project = data;
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Project access denied or not found" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const selectedModel = project.selected_model || "gemini-2.5-flash";
  const maxTokens = project.max_tokens || 32768;

  // Select API key based on model
  let apiKey: string;
  let apiEndpoint: string;
  let modelName: string;

  if (selectedModel.startsWith("gemini")) {
    apiKey = Deno.env.get("GEMINI_API_KEY")!;
    apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:streamGenerateContent?key=${apiKey}&alt=sse`;
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
    return new Response(
      JSON.stringify({ error: `Unsupported model: ${selectedModel}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: `API key not configured for model: ${selectedModel}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Handle session: create new or load existing
  let sessionId: string;
  let session: any;

  if (isNewSession) {
    // Create new session
    try {
      const { data, error: sessionError } = await supabase.rpc("create_agent_session_with_token", {
        p_project_id: projectId,
        p_token: shareToken,
        p_mode: mode,
        p_task_description: taskDescription || "",
        p_agent_type: "coding",
      });
      if (sessionError) throw sessionError;
      if (!data) throw new Error("Failed to create session");
      session = data;
      sessionId = session.id;
    } catch (e) {
      return new Response(
        JSON.stringify({ error: `Failed to create session: ${e instanceof Error ? e.message : String(e)}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log user's task as first message
    await supabase.rpc("insert_agent_message_with_token", {
      p_session_id: sessionId,
      p_token: shareToken,
      p_role: "user",
      p_content: taskDescription || "",
      p_metadata: { attachedFiles, projectContext },
    });

    console.log("Created new session:", sessionId);
  } else {
    // Load existing session
    sessionId = existingSessionId;
    try {
      const { data, error } = await supabase.rpc("get_agent_session_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
      });
      console.log("get_agent_session_with_token response:", { data, error, dataType: typeof data, isArray: Array.isArray(data) });
      if (error) throw error;
      // get_agent_session_with_token returns a single row, not an array
      // Handle both array and single object responses from Supabase RPC
      const sessionData = Array.isArray(data) ? data[0] : data;
      if (!sessionData) throw new Error("Session not found");
      session = sessionData;

      // Check if abort requested
      if (session.abort_requested || session.status === "aborted") {
        return new Response(
          JSON.stringify({ error: "Session was aborted", status: "aborted", sessionId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (e) {
      return new Response(
        JSON.stringify({ error: `Failed to load session: ${e instanceof Error ? e.message : String(e)}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Loaded existing session:", sessionId);
  }

  // Build manifest
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

  // Merge custom tool descriptions if provided
  if (customToolDescriptions) {
    if (customToolDescriptions.file_operations) {
      for (const [toolName, desc] of Object.entries(customToolDescriptions.file_operations)) {
        if (manifest.file_operations[toolName]) {
          manifest.file_operations[toolName].description = desc;
        }
      }
    }
    if (customToolDescriptions.project_exploration_tools && manifest.project_exploration_tools) {
      for (const [toolName, desc] of Object.entries(customToolDescriptions.project_exploration_tools)) {
        if (manifest.project_exploration_tools[toolName]) {
          manifest.project_exploration_tools[toolName].description = desc;
        }
      }
    }
  }

  // Build attached files section (only for first iteration)
  let attachedFilesSection = "";
  if (isNewSession && attachedFiles && attachedFiles.length > 0) {
    const attachedList = attachedFiles.map((f) => `- ${f.path} (file_id: ${f.id})`).join("\n");
    attachedFilesSection = `\n\n🔗 USER HAS ATTACHED ${attachedFiles.length} FILE(S) - THESE FILES ARE YOUR PRIMARY FOCUS:\n${attachedList}\n\nCRITICAL: The file_id values are PROVIDED ABOVE. Use read_file directly with these IDs - DO NOT call list_files first.`;
  }

  // Build context summary (only for first iteration)
  let contextSummary = "";
  if (isNewSession && projectContext) {
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

  const MAX_ITERATIONS = Math.min(Math.max(requestedMaxIterations, 1), 500);

  // Default prompt sections
  const defaultPromptSections: AgentPromptSection[] = [
    { id: "role", title: "Agent Role", type: "static", editable: "editable", order: 1, content: `You are a senior software engineer with expert knowledge across all programming languages, frameworks, and best practices.\n\nYour task is: {{TASK_MODE}}\nAuto-commit mode: {{AUTO_COMMIT}}\n\n{{PROJECT_CONTEXT}}` },
    { id: "chat_context", title: "Chat Context", type: "dynamic", editable: "readonly", order: 2, content: "{{CHAT_HISTORY}}" },
    { id: "attached_files_with", title: "Attached Files (With Files)", type: "dynamic", editable: "readonly", order: 3, content: "{{ATTACHED_FILES_LIST}}" },
    { id: "attached_files_without", title: "Attached Files (Without Files)", type: "dynamic", editable: "readonly", order: 3, content: "No files are attached. Use list_files first to explore the project structure, then read relevant files." },
    { id: "available_tools", title: "Available Tools", type: "dynamic", editable: "readonly", order: 5, content: "{{TOOLS_LIST}}" },
    { id: "response_format", title: "Response Format", type: "dynamic", editable: "readonly", order: 6, content: "{{RESPONSE_SCHEMA}}" },
    { id: "blackboard_section", title: "Blackboard (Memory)", type: "dynamic", editable: "readonly", order: 7, content: "{{BLACKBOARD}}" },
    { id: "core_principles", title: "Core Principles", type: "static", editable: "editable", order: 8, content: `## CORE PRINCIPLES\n\n1. **Read Before Edit**: ALWAYS read_file before attempting edit_lines. Never assume file content.\n2. **Line Numbers Matter**: Use <<N>> line prefixes from read_file output for precise edits.\n3. **Atomic Operations**: Make one logical change per operation when possible.\n4. **Verify Your Work**: After edits, use read_file to confirm changes if uncertain.\n5. **Status Tracking**: Set status to "completed" ONLY when the task is fully done.` },
    { id: "file_handling", title: "File Handling Rules", type: "static", editable: "editable", order: 9, content: `## FILE HANDLING RULES\n\n- **New Files**: Use create_file with full content.\n- **Modifications**: Use edit_lines with exact line ranges from read_file output.\n- **Deletions**: Use delete_file for removing files entirely.\n- **Moves/Renames**: Use move_file to change file paths.\n- **Staging**: All write operations automatically stage changes.` },
    { id: "error_handling", title: "Error Handling", type: "static", editable: "editable", order: 10, content: `## ERROR HANDLING\n\nIf an operation fails:\n1. Read the error message carefully\n2. Adjust your approach based on the error\n3. Try alternative methods if available\n4. Document issues in blackboard_entry for future reference` },
    { id: "critical_rules", title: "Critical Rules", type: "static", editable: "editable", order: 11, content: `## CRITICAL RULES\n\n⚠️ NEVER modify lines outside your specified range\n⚠️ NEVER assume file content without reading first\n⚠️ NEVER use stale file_ids from previous sessions\n⚠️ ALWAYS include reasoning in your response\n⚠️ ALWAYS set appropriate status (in_progress or completed)` },
    { id: "iteration_rules", title: "Iteration Rules", type: "static", editable: "editable", order: 12, content: `## ITERATION BEHAVIOR\n\n- You run in a loop until you set status: "completed"\n- Each iteration should make meaningful progress\n- Use blackboard_entry to track your progress across iterations\n- If stuck, document the issue and set status: "completed" with explanation` },
    { id: "iteration_status", title: "Iteration Status", type: "dynamic", editable: "readonly", order: 13, content: "Current iteration: {{CURRENT_ITERATION}} of {{MAX_ITERATIONS}}" }
  ];

  const sectionsToUse = (promptSections && promptSections.length > 0) ? promptSections : defaultPromptSections;

  // Load conversation history from DB for continuations
  let conversationHistory: Array<{ role: string; content: string }> = [];
  
  if (!isNewSession) {
    // CRITICAL: First add the original task from the session so the LLM knows the context
    if (session?.task_description) {
      conversationHistory.push({ role: "user", content: `Task: ${session.task_description}` });
    }
    
    // Load previous messages from DB to rebuild conversation
    const { data: previousMessages } = await supabase.rpc("get_agent_messages_with_token", {
      p_session_id: sessionId,
      p_token: shareToken,
      p_limit: 50, // Last 50 messages for context
      p_offset: 0,
    });

    if (previousMessages && previousMessages.length > 0) {
      // Sort oldest first (messages are returned DESC by default)
      const sortedMessages = [...previousMessages].reverse();
      for (const msg of sortedMessages) {
        if (msg.role === 'user') {
          conversationHistory.push({ role: "user", content: msg.content });
        } else if (msg.role === 'assistant' || msg.role === 'agent') {
          conversationHistory.push({ role: "assistant", content: msg.content });
        } else if (msg.role === 'system' && msg.metadata?.type === 'operation_results') {
          // Include operation results as user context so LLM sees them
          conversationHistory.push({ role: "user", content: msg.content });
        }
      }
    }
    console.log(`Loaded ${conversationHistory.length} messages from DB for continuation (including task and operation results)`);
  } else {
    // For new sessions, start with task description
    conversationHistory.push({ role: "user", content: `Task: ${taskDescription || ""}` });
  }

  // Fetch blackboard entries
  let blackboardSummary = "";
  try {
    const { data: blackboardEntries } = await supabase.rpc("get_agent_blackboard_with_token", {
      p_session_id: sessionId,
      p_token: shareToken,
    });
    if (blackboardEntries && blackboardEntries.length > 0) {
      blackboardSummary = blackboardEntries
        .slice(-10)
        .map((e: any) => `[${e.entry_type}] ${e.content}`)
        .join("\n");
    }
  } catch (err) {
    console.warn("Could not fetch blackboard entries:", err);
  }

  // Build system prompt
  function buildDynamicSystemPrompt(
    sections: AgentPromptSection[], 
    currentIteration: number = 1, 
    maxIters: number = 30,
    blackboardEntries: string = ""
  ): string {
    const enabledSections = sections.filter(s => s.enabled !== false);
    const sortedSections = [...enabledSections].sort((a, b) => a.order - b.order);
    
    const toolsListText = generateToolsListText(manifest, exposeProject);
    const responseSchemaText = generateResponseSchemaText(manifest, exposeProject);
    
    const hasAttachedFiles = attachedFiles && attachedFiles.length > 0;
    
    const filteredSections = sortedSections.filter(s => {
      if (s.id === "attached_files_with") return hasAttachedFiles;
      if (s.id === "attached_files_without") return !hasAttachedFiles;
      return true;
    });
    
    const variables: Record<string, string> = {
      "{{TOOLS_LIST}}": toolsListText,
      "{{RESPONSE_SCHEMA}}": responseSchemaText,
      "{{TASK_MODE}}": mode,
      "{{AUTO_COMMIT}}": String(autoCommit),
      "{{PROJECT_CONTEXT}}": contextSummary ? `Project Context:\n${contextSummary}` : "",
      "{{ATTACHED_FILES_LIST}}": attachedFilesSection,
      "{{ATTACHED_FILES_INSTRUCTION}}": hasAttachedFiles
        ? attachedFilesSection
        : "No files are attached. Use list_files first to explore the project structure, then read relevant files.",
      "{{CHAT_HISTORY}}": chatHistorySection,
      "{{BLACKBOARD}}": blackboardEntries 
        ? `=== YOUR WORKING MEMORY ===\n${blackboardEntries}\n=== END MEMORY ===` 
        : "(No blackboard entries yet)",
      "{{CURRENT_ITERATION}}": String(currentIteration),
      "{{MAX_ITERATIONS}}": String(maxIters),
    };
    
    const promptParts: string[] = [];
    for (const section of filteredSections) {
      let content = section.content;
      for (const [key, value] of Object.entries(variables)) {
        content = content.split(key).join(value);
      }
      promptParts.push(content);
    }
    
    return promptParts.join("\n\n");
  }

  const systemPrompt = buildDynamicSystemPrompt(sectionsToUse, iteration, MAX_ITERATIONS, blackboardSummary);

  // Session file registry for tracking files created in this session
  const sessionFileRegistry = new Map<string, { 
    staging_id: string; 
    path: string; 
    content: string;
    created_at: Date;
  }>();

  // Create the SSE stream - this now handles SINGLE ITERATION only
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendSSE = (event: SSEEventType, data: any) => {
        const message = `data: ${JSON.stringify({ type: event, ...data })}\n\n`;
        try {
          controller.enqueue(encoder.encode(message));
        } catch (e) {
          console.error("Failed to send SSE event:", e);
        }
      };

      // Send session info immediately
      sendSSE('session_created', { sessionId, iteration, isNewSession });

      try {
        console.log(`\n=== Iteration ${iteration} ===`);

        // Build conversation for LLM
        const conversationForLLM = [...conversationHistory];

        const fullInputPrompt = JSON.stringify({
          systemPrompt,
          conversationForLLM,
          timestamp: new Date().toISOString()
        }, null, 2);

        // Call LLM and stream response
        let rawOutputText = "";

        if (selectedModel.startsWith("gemini")) {
          // Gemini streaming
          const contents = conversationForLLM.map((msg) => ({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }],
          }));

          const llmResponse = await fetch(apiEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents,
              generationConfig: {
                maxOutputTokens: maxTokens,
                temperature: 0.7,
                responseMimeType: "application/json",
              },
            }),
          });

          if (!llmResponse.ok) {
            const errorText = await llmResponse.text();
            console.error("Gemini API error:", llmResponse.status, errorText);
            
            await supabase.rpc("insert_agent_llm_log_with_token", {
              p_session_id: sessionId,
              p_project_id: projectId,
              p_token: shareToken,
              p_iteration: iteration,
              p_model: selectedModel,
              p_input_prompt: fullInputPrompt,
              p_output_raw: errorText,
              p_was_parse_success: false,
              p_parse_error_message: `API error: ${llmResponse.status}`,
              p_api_response_status: llmResponse.status,
            });

            if (llmResponse.status === 429) throw new Error("Rate limit exceeded. Please try again later.");
            if (llmResponse.status === 402) throw new Error("Payment required. Please add credits to your API account.");
            throw new Error(`Gemini API error: ${errorText}`);
          }

          // Stream immediately from response body
          const reader = llmResponse.body?.getReader();
          if (!reader) throw new Error("No response body reader available");
          let textBuffer = "";
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            textBuffer += decoder.decode(value, { stream: true });
            
            let newlineIndex: number;
            while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
              let line = textBuffer.slice(0, newlineIndex);
              textBuffer = textBuffer.slice(newlineIndex + 1);
              
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (line.trim() === "" || line.startsWith(':')) continue;
              if (!line.startsWith('data: ')) continue;
              
              const jsonStr = line.slice(6).trim();
              if (!jsonStr || jsonStr === "[DONE]") continue;
              
              try {
                const parsed = JSON.parse(jsonStr);
                const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
                
                if (text) {
                  rawOutputText += text;
                  sendSSE('llm_streaming', { iteration, charsReceived: rawOutputText.length, delta: text });
                }
              } catch (e) {
                // Ignore parse errors for partial chunks
              }
            }
          }
          reader.releaseLock();

        } else if (selectedModel.startsWith("claude")) {
          // Claude streaming
          const messages = conversationForLLM.map((msg) => ({
            role: msg.role,
            content: msg.content,
          }));

          const llmResponse = await fetch(apiEndpoint, {
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
              stream: true,
            }),
          });

          if (!llmResponse.ok) {
            const errorText = await llmResponse.text();
            console.error("Claude API error:", llmResponse.status, errorText);
            
            await supabase.rpc("insert_agent_llm_log_with_token", {
              p_session_id: sessionId,
              p_project_id: projectId,
              p_token: shareToken,
              p_iteration: iteration,
              p_model: selectedModel,
              p_input_prompt: fullInputPrompt,
              p_output_raw: errorText,
              p_was_parse_success: false,
              p_parse_error_message: `API error: ${llmResponse.status}`,
              p_api_response_status: llmResponse.status,
            });

            if (llmResponse.status === 429) throw new Error("Rate limit exceeded. Please try again later.");
            if (llmResponse.status === 402) throw new Error("Payment required. Please add credits to your API account.");
            throw new Error(`Claude API error: ${errorText}`);
          }

          const reader = llmResponse.body?.getReader();
          if (!reader) throw new Error("No response body reader available");
          let textBuffer = "";
          let claudeToolInput = "";
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            textBuffer += decoder.decode(value, { stream: true });
            
            let newlineIndex: number;
            while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
              let line = textBuffer.slice(0, newlineIndex);
              textBuffer = textBuffer.slice(newlineIndex + 1);
              
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (line.trim() === "" || line.startsWith(':')) continue;
              if (!line.startsWith('data: ')) continue;
              
              const jsonStr = line.slice(6).trim();
              if (!jsonStr || jsonStr === "[DONE]") continue;
              
              try {
                const parsed = JSON.parse(jsonStr);
                let text = "";
                
                if (parsed.type === "content_block_delta") {
                  if (parsed.delta?.type === "text_delta") {
                    text = parsed.delta.text || "";
                  } else if (parsed.delta?.type === "input_json_delta") {
                    const partialJson = parsed.delta.partial_json || "";
                    claudeToolInput += partialJson;
                    text = partialJson;
                  }
                }
                
                if (text) {
                  rawOutputText += text;
                  sendSSE('llm_streaming', { iteration, charsReceived: rawOutputText.length, delta: text });
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
          reader.releaseLock();
          
          if (claudeToolInput) {
            rawOutputText = claudeToolInput;
          }

        } else if (selectedModel.startsWith("grok")) {
          // xAI streaming
          const messages = [
            { role: "system", content: systemPrompt },
            ...conversationForLLM.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
          ];

          const llmResponse = await fetch(apiEndpoint, {
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
              stream: true,
            }),
          });

          if (!llmResponse.ok) {
            const errorText = await llmResponse.text();
            console.error("Grok API error:", llmResponse.status, errorText);
            
            await supabase.rpc("insert_agent_llm_log_with_token", {
              p_session_id: sessionId,
              p_project_id: projectId,
              p_token: shareToken,
              p_iteration: iteration,
              p_model: selectedModel,
              p_input_prompt: fullInputPrompt,
              p_output_raw: errorText,
              p_was_parse_success: false,
              p_parse_error_message: `API error: ${llmResponse.status}`,
              p_api_response_status: llmResponse.status,
            });

            if (llmResponse.status === 429) throw new Error("Rate limit exceeded. Please try again later.");
            if (llmResponse.status === 402) throw new Error("Payment required. Please add credits to your API account.");
            throw new Error(`Grok API error: ${errorText}`);
          }

          const reader = llmResponse.body?.getReader();
          if (!reader) throw new Error("No response body reader available");
          let textBuffer = "";
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            textBuffer += decoder.decode(value, { stream: true });
            
            let newlineIndex: number;
            while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
              let line = textBuffer.slice(0, newlineIndex);
              textBuffer = textBuffer.slice(newlineIndex + 1);
              
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (line.trim() === "" || line.startsWith(':')) continue;
              if (!line.startsWith('data: ')) continue;
              
              const jsonStr = line.slice(6).trim();
              if (!jsonStr || jsonStr === "[DONE]") continue;
              
              try {
                const parsed = JSON.parse(jsonStr);
                const text = parsed.choices?.[0]?.delta?.content || "";
                
                if (text) {
                  rawOutputText += text;
                  sendSSE('llm_streaming', { iteration, charsReceived: rawOutputText.length, delta: text });
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
          reader.releaseLock();
        }

        sendSSE('llm_complete', { iteration, totalChars: rawOutputText.length });

        // Parse agent response
        const agentResponse = parseAgentResponseText(rawOutputText);

        // Log to LLM logs
        const llmLogResult = await supabase.rpc("insert_agent_llm_log_with_token", {
          p_session_id: sessionId,
          p_project_id: projectId,
          p_token: shareToken,
          p_iteration: iteration,
          p_model: selectedModel,
          p_input_prompt: fullInputPrompt,
          p_output_raw: rawOutputText,
          p_was_parse_success: agentResponse.status !== "parse_error",
          p_parse_error_message: agentResponse.status === "parse_error" ? "Failed to parse response" : null,
          p_api_response_status: 200,
        });
        if (llmLogResult.error) {
          console.error("[AGENT] Failed to insert LLM log:", JSON.stringify(llmLogResult.error));
        }

        // Handle blackboard entry
        if (agentResponse.blackboard_entry) {
          // Validate entry_type to prevent malformed values from LLM
          const validEntryTypes = ['planning', 'progress', 'decision', 'reasoning', 'next_steps', 'reflection'];
          let entryType = agentResponse.blackboard_entry.entry_type || "progress";
          if (typeof entryType !== 'string' || entryType.includes('<') || !validEntryTypes.includes(entryType)) {
            console.warn("[AGENT] Invalid blackboard entry_type:", entryType, "- defaulting to 'progress'");
            entryType = 'progress';
          }
          
          const blackboardResult = await supabase.rpc("add_blackboard_entry_with_token", {
            p_session_id: sessionId,
            p_token: shareToken,
            p_entry_type: entryType,
            p_content: agentResponse.blackboard_entry.content || "",
            p_metadata: null,
          });
          if (blackboardResult.error) {
            console.error("[AGENT] Failed to insert blackboard entry:", JSON.stringify(blackboardResult.error));
          } else {
            console.log("[AGENT] Blackboard entry saved successfully");
          }
        }

        // Log agent message (must use 'agent' role - database constraint)
        const agentMsgResult = await supabase.rpc("insert_agent_message_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_role: "agent",
          p_content: rawOutputText,
          p_metadata: { reasoning: agentResponse.reasoning, status: agentResponse.status, iteration },
        });
        if (agentMsgResult.error) {
          console.error("[AGENT] Failed to insert agent message:", JSON.stringify(agentMsgResult.error));
        } else {
          console.log("[AGENT] Agent message saved successfully, id:", agentMsgResult.data?.id);
        }

        // Broadcast message refresh to coding-specific channel
        await supabase.channel(`agent-messages-project-${projectId}-coding`).send({
          type: 'broadcast',
          event: 'agent_message_refresh',
          payload: { sessionId, iteration }
        });

        // Execute operations
        const operationResults = [];
        let filesChanged = false;

        // Sort edits back-to-front
        const operations = [...(agentResponse.operations || [])];
        const editsByFile = new Map<string, any[]>();
        const nonEditOps: any[] = [];

        for (const op of operations) {
          const hasMalformedParams = op && !op.params && ((op as any)._param_keys !== undefined || (op as any).params_summary !== undefined);
          if (hasMalformedParams) {
            const parameterlessOps = ['list_files', 'get_staged_changes', 'discard_all_staged'];
            if (parameterlessOps.includes(op.type)) {
              op.params = {} as any;
              if (op.type === 'list_files') {
                op.params.path_prefix = null;
              }
            }
          }
          
          if (!op || !op.params) {
            console.warn(`[AGENT] Skipping invalid operation (missing params):`, JSON.stringify({ type: op?.type }));
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

        const sortedOperations: any[] = [...nonEditOps];
        for (const [fileId, edits] of editsByFile) {
          edits.sort((a, b) => b.params.start_line - a.params.start_line);
          let lastStartLine = Infinity;
          for (const edit of edits) {
            if (edit.params.end_line >= lastStartLine) {
              console.warn(`[AGENT] Skipping overlapping edit`);
              continue;
            }
            lastStartLine = edit.params.start_line;
            sortedOperations.push(edit);
          }
        }

        console.log(`[AGENT] Executing ${sortedOperations.length} operations`);

        for (let opIndex = 0; opIndex < sortedOperations.length; opIndex++) {
          const op = sortedOperations[opIndex];
          console.log("Executing operation:", op.type);
          
          sendSSE('operation_start', { 
            iteration, 
            operation: op.type, 
            operationIndex: opIndex,
            totalOperations: sortedOperations.length,
            path: op.params?.path || op.params?.file_path || null 
          });
          
          const { data: logEntry } = await supabase.rpc("log_agent_operation_with_token", {
            p_session_id: sessionId,
            p_operation_type: op.type,
            p_file_path: op.params.path || op.params.file_path || null,
            p_status: "in_progress",
            p_details: op.params,
            p_token: shareToken,
          });

          await supabase.channel(`agent-operations-project-${projectId}-coding`).send({
            type: 'broadcast',
            event: 'agent_operation_refresh',
            payload: { sessionId, operationId: logEntry?.id, status: 'in_progress' }
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
                
                if (result.data && Array.isArray(result.data)) {
                  for (const [filePath, info] of sessionFileRegistry) {
                    const existingIdx = result.data.findIndex((f: any) => f.path === filePath);
                    if (existingIdx >= 0) {
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
                break;

              case "read_file": {
                const filePath = op.params.path;
                let fileId = op.params.file_id;
                let resolvedPath: string | null = null;
                let resolvedContent: string | null = null;
                
                // First check session registry for newly created files
                if (filePath && sessionFileRegistry.has(filePath)) {
                  const entry = sessionFileRegistry.get(filePath)!;
                  resolvedPath = entry.path;
                  resolvedContent = entry.content;
                }
                
                // Then check staged changes
                if (!resolvedContent && filePath) {
                  const { data: stagedCheck } = await supabase.rpc("get_staged_changes_with_token", {
                    p_repo_id: repoId,
                    p_token: shareToken,
                  });
                  const matchedStaged = stagedCheck?.find((s: any) => s.file_path === filePath);
                  if (matchedStaged) {
                    fileId = matchedStaged.id;
                    resolvedPath = matchedStaged.file_path;
                    resolvedContent = matchedStaged.new_content || matchedStaged.old_content;
                  }
                }
                
                // Fall back to repo files
                if (!resolvedContent && filePath) {
                  const { data: repoFiles } = await supabase.rpc("get_repo_file_paths_with_token", {
                    p_repo_id: repoId,
                    p_token: shareToken,
                    p_path_prefix: null,
                  });
                  const matchedFile = repoFiles?.find((f: any) => f.path === filePath);
                  if (matchedFile) {
                    fileId = matchedFile.id;
                    resolvedPath = matchedFile.path;
                  }
                }
                
                if (resolvedContent) {
                  const lines = resolvedContent.split('\n').map((line: string, idx: number) => `<<${idx + 1}>>${line}`).join('\n');
                  result = { data: [{ path: resolvedPath, content: lines, total_lines: resolvedContent.split('\n').length }] };
                } else if (fileId) {
                  result = await supabase.rpc("get_file_content_with_token", {
                    p_file_id: fileId,
                    p_token: shareToken,
                  });
                } else {
                  throw new Error(`File not found: ${filePath || 'no path or file_id provided'}`);
                }
                break;
              }

              case "edit_lines": {
                const editPath = op.params.path;
                let editFileId = op.params.file_id;
                let resolvedEditPath: string | null = null;
                
                // Check session registry
                if (editPath && sessionFileRegistry.has(editPath)) {
                  const entry = sessionFileRegistry.get(editPath)!;
                  editFileId = entry.staging_id;
                  resolvedEditPath = entry.path;
                }
                
                // Check staged changes
                if (!resolvedEditPath && editPath) {
                  const { data: stagedCheck } = await supabase.rpc("get_staged_changes_with_token", {
                    p_repo_id: repoId,
                    p_token: shareToken,
                  });
                  const matchedStaged = stagedCheck?.find((s: any) => s.file_path === editPath);
                  if (matchedStaged) {
                    editFileId = matchedStaged.id;
                    resolvedEditPath = matchedStaged.file_path;
                  }
                }
                
                // Check repo files
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
                  }
                }
                
                if (!editFileId) {
                  throw new Error(`File not found: ${editPath || 'no path or file_id provided'}`);
                }
                
                const readResult = await supabase.rpc("get_file_content_with_token", {
                  p_file_id: editFileId,
                  p_token: shareToken,
                });

                if (readResult.error) throw new Error(`Failed to read file: ${readResult.error.message}`);
                if (!readResult.data || readResult.data.length === 0) {
                  throw new Error(`File not found: ${editPath || editFileId}`);
                }

                const fileData = readResult.data[0];
                const baseContent = fileData.content;
                const baseLines = baseContent.split("\n");
                const totalBaseLines = baseLines.length;

                let startIdx = op.params.start_line - 1;
                if (startIdx > totalBaseLines) startIdx = totalBaseLines;

                let endIdx = op.params.end_line - 1;
                if (endIdx >= totalBaseLines) endIdx = totalBaseLines - 1;

                if (startIdx < 0) {
                  throw new Error(`Invalid start line: start_line=${op.params.start_line}`);
                }

                let newContent: string;
                const newContentLines = op.params.new_content.split("\n");
                
                if (startIdx >= totalBaseLines) {
                  const appendedLines = [...baseLines, ...newContentLines];
                  newContent = appendedLines.join("\n");
                } else {
                  const deleteCount = startIdx <= endIdx ? (endIdx - startIdx + 1) : 0;
                  const newLines = [...baseLines];
                  newLines.splice(startIdx, deleteCount, ...newContentLines);
                  newContent = newLines.join("\n");
                }

                result = await supabase.rpc("stage_file_change_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                  p_operation_type: "edit",
                  p_file_path: fileData.path,
                  p_old_content: baseContent,
                  p_new_content: newContent,
                });

                if (!result.error && result.data?.[0]) {
                  sessionFileRegistry.set(fileData.path, {
                    staging_id: result.data[0].id,
                    path: fileData.path,
                    content: newContent,
                    created_at: new Date(),
                  });
                  result.data[0].total_lines = newContent.split("\n").length;
                }
                filesChanged = true;
                break;
              }

              case "create_file": {
                result = await supabase.rpc("stage_file_change_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                  p_operation_type: "add",
                  p_file_path: op.params.path,
                  p_new_content: op.params.content,
                });

                if (!result.error && result.data?.[0]) {
                  sessionFileRegistry.set(op.params.path, {
                    staging_id: result.data[0].id,
                    path: op.params.path,
                    content: op.params.content,
                    created_at: new Date(),
                  });
                }
                filesChanged = true;
                break;
              }

              case "delete_file": {
                const deletePath = op.params.path;
                let deleteFileId = op.params.file_id;
                let deleteFilePath: string | null = null;
                let deleteFileContent: string | null = null;
                
                if (deletePath && sessionFileRegistry.has(deletePath)) {
                  const entry = sessionFileRegistry.get(deletePath)!;
                  deleteFileId = entry.staging_id;
                  deleteFilePath = entry.path;
                  deleteFileContent = entry.content;
                }
                
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
                  }
                }
                
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
                  }
                }
                
                if (!deleteFilePath && deleteFileId) {
                  const { data: deleteFileData } = await supabase.rpc("get_file_content_with_token", {
                    p_file_id: deleteFileId,
                    p_token: shareToken,
                  });
                  if (deleteFileData?.[0]) {
                    deleteFilePath = deleteFileData[0].path;
                    deleteFileContent = deleteFileData[0].content;
                  }
                }
                
                if (!deleteFilePath) {
                  throw new Error(`File not found: ${deletePath || deleteFileId}`);
                }

                const { data: stagedForDelete } = await supabase.rpc("get_staged_changes_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                });
                const newlyCreatedDelete = stagedForDelete?.find(
                  (s: any) => s.file_path === deleteFilePath && s.operation_type === "add",
                );

                if (newlyCreatedDelete) {
                  result = await supabase.rpc("unstage_file_with_token", {
                    p_repo_id: repoId,
                    p_file_path: deleteFilePath,
                    p_token: shareToken,
                  });
                  if (sessionFileRegistry.has(deleteFilePath)) {
                    sessionFileRegistry.delete(deleteFilePath);
                  }
                } else {
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
                }
                filesChanged = true;
                break;
              }

              case "move_file": {
                const movePath = op.params.path;
                let moveFileId = op.params.file_id;
                let moveFilePath: string | null = null;
                let moveFileContent: string | null = null;
                
                if (movePath && sessionFileRegistry.has(movePath)) {
                  const entry = sessionFileRegistry.get(movePath)!;
                  moveFileId = entry.staging_id;
                  moveFilePath = entry.path;
                  moveFileContent = entry.content;
                }
                
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
                  }
                }
                
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
                  }
                }
                
                if (!moveFilePath && moveFileId) {
                  const { data: moveFileData } = await supabase.rpc("get_file_content_with_token", {
                    p_file_id: moveFileId,
                    p_token: shareToken,
                  });
                  if (moveFileData?.[0]) {
                    moveFilePath = moveFileData[0].path;
                    moveFileContent = moveFileData[0].content;
                  }
                }
                
                if (!moveFilePath) {
                  throw new Error(`File not found: ${movePath || moveFileId}`);
                }
                
                const { data: stagedForMove } = await supabase.rpc("get_staged_changes_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                });
                const newlyCreatedMove = stagedForMove?.find(
                  (s: any) => s.file_path === moveFilePath && s.operation_type === "add",
                );

                if (newlyCreatedMove) {
                  const oldPath = moveFilePath;
                  result = await supabase.rpc("update_staged_file_path_with_token", {
                    p_staging_id: newlyCreatedMove.id,
                    p_new_path: op.params.new_path,
                    p_token: shareToken,
                  });
                  
                  if (sessionFileRegistry.has(oldPath)) {
                    const existingEntry = sessionFileRegistry.get(oldPath)!;
                    sessionFileRegistry.delete(oldPath);
                    sessionFileRegistry.set(op.params.new_path, {
                      ...existingEntry,
                      path: op.params.new_path,
                    });
                  }
                } else {
                  result = await supabase.rpc("move_file_with_token", {
                    p_file_id: moveFileId,
                    p_new_path: op.params.new_path,
                    p_token: shareToken,
                  });
                }
                filesChanged = true;
                break;
              }

              case "get_staged_changes":
                result = await supabase.rpc("get_staged_changes_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                });
                if (result.data && Array.isArray(result.data)) {
                  result.data = result.data.map((item: any) => ({
                    id: item.id,
                    file_path: item.file_path,
                    operation_type: item.operation_type,
                    is_binary: item.is_binary,
                    created_at: item.created_at,
                  }));
                }
                break;

              case "unstage_file":
                result = await supabase.rpc("unstage_file_with_token", {
                  p_repo_id: repoId,
                  p_file_path: op.params.file_path,
                  p_token: shareToken,
                });
                if (sessionFileRegistry.has(op.params.file_path)) {
                  sessionFileRegistry.delete(op.params.file_path);
                }
                filesChanged = true;
                break;

              case "discard_all_staged":
                result = await supabase.rpc("discard_staged_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                });
                sessionFileRegistry.clear();
                filesChanged = true;
                break;

              case "project_inventory":
                if (!exposeProject) {
                  throw new Error("project_inventory is not enabled. Enable 'Expose Project to Agent' in Agent Configuration.");
                }
                result = await supabase.rpc("get_project_inventory_with_token", {
                  p_project_id: projectId,
                  p_token: shareToken,
                });
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
                break;
            }

            if (result?.error) throw result.error;

            await supabase.rpc("update_agent_operation_status_with_token", {
              p_operation_id: logEntry.id,
              p_status: "completed",
              p_token: shareToken,
            });

            await supabase.channel(`agent-operations-project-${projectId}-coding`).send({
              type: 'broadcast',
              event: 'agent_operation_refresh',
              payload: { sessionId, operationId: logEntry.id, status: 'completed' }
            });

            operationResults.push({ type: op.type, success: true, data: result?.data });
            sendSSE('operation_complete', { iteration, operation: op.type, success: true });
          } catch (error) {
            console.error("Operation failed:", error);

            let errorMessage: string;
            if (error instanceof Error) {
              errorMessage = error.message;
            } else if (typeof error === "object" && error !== null) {
              errorMessage = JSON.stringify(error, null, 2);
            } else {
              errorMessage = String(error);
            }

            await supabase.rpc("update_agent_operation_status_with_token", {
              p_operation_id: logEntry.id,
              p_status: "failed",
              p_error_message: errorMessage,
              p_token: shareToken,
            });

            await supabase.channel(`agent-operations-project-${projectId}-coding`).send({
              type: 'broadcast',
              event: 'agent_operation_refresh',
              payload: { sessionId, operationId: logEntry.id, status: 'failed' }
            });

            operationResults.push({
              type: op.type,
              success: false,
              error: errorMessage,
            });
            sendSSE('operation_complete', { iteration, operation: op.type, success: false, error: errorMessage });
          }
        }

        // Broadcast file changes
        if (filesChanged) {
          try {
            const stagingChannel = supabase.channel(`repo-staging-${repoId}`);
            await stagingChannel.subscribe();
            await stagingChannel.send({
              type: "broadcast",
              event: "staging_refresh",
              payload: { repoId, action: "agent_edit", timestamp: Date.now() },
            });
            await supabase.removeChannel(stagingChannel);

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

        // Log operation summaries as user message for next iteration context
        const summarizedResults = operationResults.map((r: any) => {
          const summary: any = { type: r.type, success: r.success };
          if (r.error) summary.error = r.error;
          if (r.success && r.data) {
            switch (r.type) {
              case "list_files":
                summary.summary = `Listed ${Array.isArray(r.data) ? r.data.length : 0} files`;
                // Include actual file list so agent can see paths and IDs
                if (Array.isArray(r.data)) {
                  summary.files = r.data.map((f: any) => ({ id: f.id, path: f.path }));
                }
                break;
              case "wildcard_search":
                summary.summary = `Found ${Array.isArray(r.data) ? r.data.length : 0} matching files`;
                if (Array.isArray(r.data)) {
                  summary.files = r.data.map((f: any) => ({ id: f.id, path: f.path, match_count: f.match_count }));
                }
                break;
              case "search":
                summary.summary = `Found ${Array.isArray(r.data) ? r.data.length : 0} results`;
                // Include search results with snippets
                if (Array.isArray(r.data)) {
                  summary.results = r.data.map((f: any) => ({ 
                    id: f.id, 
                    path: f.path, 
                    snippet: f.snippet || f.content?.slice(0, 500) 
                  }));
                }
                break;
              case "read_file":
                if (Array.isArray(r.data) && r.data[0]) {
                  const fileData = r.data[0];
                  summary.summary = `Read ${fileData.path} (${fileData.total_lines || 'unknown'} lines)`;
                  // Include actual file content so the agent can see it
                  summary.path = fileData.path;
                  summary.content = fileData.content;
                  summary.total_lines = fileData.total_lines;
                }
                break;
              case "get_staged_changes":
                summary.summary = `${Array.isArray(r.data) ? r.data.length : 0} staged changes`;
                if (Array.isArray(r.data)) summary.files = r.data;
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
              case "project_inventory":
                summary.summary = `Retrieved project inventory`;
                summary.data = r.data;
                break;
              case "project_category":
                summary.summary = `Retrieved category data`;
                summary.data = r.data;
                break;
              case "project_elements":
                summary.summary = `Retrieved ${Array.isArray(r.data) ? r.data.length : 0} elements`;
                summary.data = r.data;
                break;
              default:
                summary.summary = `Completed ${r.type}`;
                summary.data = r.data;
            }
          }
          return summary;
        });

        // Log operation results as SYSTEM message (not shown in chat) so next iteration has context
        await supabase.rpc("insert_agent_message_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_role: "system",
          p_content: `Operation results:\n${JSON.stringify(summarizedResults, null, 2)}`,
          p_metadata: { type: "operation_results", iteration, hidden: true },
        });

        // Determine final status for this iteration
        const agentStatus = agentResponse.status === "completed" ? "completed" : "in_progress";
        
        // Update session status if completed
        if (agentStatus === "completed") {
          await supabase.rpc("update_agent_session_status_with_token", {
            p_session_id: sessionId,
            p_status: "completed",
            p_token: shareToken,
            p_completed_at: new Date().toISOString(),
          });
        }

        console.log(`Iteration ${iteration} complete, status: ${agentStatus}`);

        // Send final iteration complete event with status for frontend to decide next action
        sendSSE('iteration_complete', { 
          sessionId, 
          iteration, 
          status: agentStatus,
          operationCount: operationResults.length,
          filesChanged,
          maxIterations: MAX_ITERATIONS
        });

      } catch (error) {
        console.error("Error in coding-agent-orchestrator:", error);

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

        sendSSE('error', {
          sessionId,
          iteration,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        try {
          controller.close();
        } catch (e) {
          // Already closed
        }
      }
    }
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
