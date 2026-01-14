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

interface DatabaseToolsManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  database_operations: Record<string, ToolDefinition>;
  project_context_tools: Record<string, ToolDefinition>;
}

interface CustomToolDescriptions {
  database_operations?: Record<string, string>;
  project_context_tools?: Record<string, string>;
}

interface DatabaseAgentRequest {
  projectId: string;
  databaseId?: string;       // Render database
  connectionId?: string;     // External connection
  taskDescription?: string;
  shareToken: string;
  maxIterations?: number;
  promptSections?: AgentPromptSection[];
  customToolDescriptions?: CustomToolDescriptions;
  projectContext?: any;
  sessionId?: string;        // For continuation
  iteration?: number;
  exposeProject?: boolean;
}

// DDL patterns for migration detection
const DDL_PATTERNS = [
  /\bCREATE\s+(OR\s+REPLACE\s+)?(TEMP(ORARY)?\s+)?TABLE\b/i,
  /\bCREATE\s+(OR\s+REPLACE\s+)?(MATERIALIZED\s+)?VIEW\b/i,
  /\bCREATE\s+(OR\s+REPLACE\s+)?FUNCTION\b/i,
  /\bCREATE\s+(OR\s+REPLACE\s+)?PROCEDURE\b/i,
  /\bCREATE\s+(OR\s+REPLACE\s+)?TRIGGER\b/i,
  /\bCREATE\s+(UNIQUE\s+)?INDEX\b/i,
  /\bCREATE\s+SEQUENCE\b/i,
  /\bCREATE\s+TYPE\b/i,
  /\bCREATE\s+SCHEMA\b/i,
  /\bCREATE\s+EXTENSION\b/i,
  /\bCREATE\s+POLICY\b/i,
  /\bALTER\s+(TABLE|VIEW|FUNCTION|SEQUENCE|TYPE|SCHEMA|INDEX|POLICY)\b/i,
  /\bDROP\s+(TABLE|VIEW|FUNCTION|PROCEDURE|TRIGGER|INDEX|SEQUENCE|TYPE|SCHEMA|EXTENSION|POLICY)\b/i,
  /\bTRUNCATE\s+(TABLE\s+)?/i,
  /\bGRANT\s+/i,
  /\bREVOKE\s+/i,
  /\bCOMMENT\s+ON\s+(TABLE|VIEW|COLUMN|FUNCTION|INDEX|SEQUENCE|TYPE|SCHEMA)\b/i,
];

function isDDLStatement(sql: string): boolean {
  return DDL_PATTERNS.some(pattern => pattern.test(sql));
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  
  while (i < sql.length) {
    const char = sql[i];
    const next = sql[i + 1];
    
    // Line comment
    if (char === '-' && next === '-') {
      current += char;
      i++;
      while (i < sql.length && sql[i] !== '\n') {
        current += sql[i];
        i++;
      }
      if (i < sql.length) {
        current += sql[i];
        i++;
      }
      continue;
    }
    
    // Block comment
    if (char === '/' && next === '*') {
      let depth = 1;
      current += '/*';
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          current += '/*';
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          current += '*/';
          i += 2;
        } else {
          current += sql[i];
          i++;
        }
      }
      continue;
    }
    
    // Dollar quote
    if (char === '$') {
      const dollarMatch = sql.slice(i).match(/^\$([a-zA-Z_][a-zA-Z0-9_]*)?\$/);
      if (dollarMatch) {
        const tag = dollarMatch[0];
        current += tag;
        i += tag.length;
        const closeIndex = sql.indexOf(tag, i);
        if (closeIndex !== -1) {
          current += sql.slice(i, closeIndex + tag.length);
          i = closeIndex + tag.length;
        } else {
          current += sql.slice(i);
          i = sql.length;
        }
        continue;
      }
    }
    
    // String literal
    if (char === "'") {
      current += char;
      i++;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            current += "''";
            i += 2;
          } else {
            current += sql[i];
            i++;
            break;
          }
        } else {
          current += sql[i];
          i++;
        }
      }
      continue;
    }
    
    // Semicolon (statement separator)
    if (char === ';') {
      const stmt = current.trim();
      if (stmt) {
        statements.push(stmt);
      }
      current = '';
      i++;
      continue;
    }
    
    current += char;
    i++;
  }
  
  const last = current.trim();
  if (last) {
    statements.push(last);
  }
  
  return statements;
}

function getObjectType(sql: string): string {
  const upperSql = sql.toUpperCase();
  if (upperSql.includes('TABLE')) return 'TABLE';
  if (upperSql.includes('MATERIALIZED VIEW')) return 'MATERIALIZED VIEW';
  if (upperSql.includes('VIEW')) return 'VIEW';
  if (upperSql.includes('FUNCTION')) return 'FUNCTION';
  if (upperSql.includes('PROCEDURE')) return 'PROCEDURE';
  if (upperSql.includes('TRIGGER')) return 'TRIGGER';
  if (upperSql.includes('INDEX')) return 'INDEX';
  if (upperSql.includes('SEQUENCE')) return 'SEQUENCE';
  if (upperSql.includes('TYPE')) return 'TYPE';
  if (upperSql.includes('SCHEMA')) return 'SCHEMA';
  if (upperSql.includes('EXTENSION')) return 'EXTENSION';
  if (upperSql.includes('POLICY')) return 'POLICY';
  return 'UNKNOWN';
}

function getStatementType(sql: string): string {
  const upperSql = sql.toUpperCase().trim();
  if (upperSql.startsWith('CREATE')) return 'CREATE';
  if (upperSql.startsWith('ALTER')) return 'ALTER';
  if (upperSql.startsWith('DROP')) return 'DROP';
  if (upperSql.startsWith('TRUNCATE')) return 'TRUNCATE';
  if (upperSql.startsWith('GRANT')) return 'GRANT';
  if (upperSql.startsWith('REVOKE')) return 'REVOKE';
  if (upperSql.startsWith('COMMENT')) return 'COMMENT';
  return 'OTHER';
}

function extractObjectName(sql: string): { schema: string | null; name: string | null } {
  // Try to extract schema.name pattern
  const patterns = [
    /(?:TABLE|VIEW|FUNCTION|TRIGGER|INDEX|SEQUENCE|TYPE|SCHEMA|POLICY)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:"?([a-zA-Z_][a-zA-Z0-9_]*)"?\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i,
  ];
  
  for (const pattern of patterns) {
    const match = sql.match(pattern);
    if (match) {
      return {
        schema: match[1] || null,
        name: match[2] || match[1] || null,
      };
    }
  }
  
  return { schema: null, name: null };
}

function parseAgentResponseText(rawText: string): any {
  const originalText = rawText.trim();
  let text = originalText;

  const tryParse = (jsonStr: string, method: string): any | null => {
    try {
      const parsed = JSON.parse(jsonStr);
      console.log(`JSON parsed successfully via ${method}`);
      return parsed;
    } catch (e) {
      return null;
    }
  };

  // Clean XML-like tags
  const cleanXmlTags = (str: string): string => {
    return str
      .replace(/"blackboard_entry":\s*"\s*\\n<parameter[^"]*"?\s*,\s*"content":\s*"([^"]*)"/g, 
        (_, content) => `"blackboard_entry": {"entry_type": "progress", "content": "${content}"}`)
      .replace(/<parameter[^>]*>[^<]*<\/parameter>/g, '')
      .replace(/<parameter[^>]*>/g, '')
      .replace(/<\/parameter>/g, '');
  };

  let result = tryParse(text, "direct parse");
  if (result) return normalizeAgentResponse(result);

  const xmlCleaned = cleanXmlTags(text);
  result = tryParse(xmlCleaned, "xml-cleaned parse");
  if (result) return normalizeAgentResponse(result);

  const lastFenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```[\s\S]*$/i);
  if (lastFenceMatch?.[1]) {
    const extracted = lastFenceMatch[1].trim();
    result = tryParse(extracted, "last code fence");
    if (result) return normalizeAgentResponse(result);
  }

  const firstBrace = originalText.indexOf("{");
  const lastBrace = originalText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = originalText.slice(firstBrace, lastBrace + 1);
    result = tryParse(candidate, "brace extraction");
    if (result) return normalizeAgentResponse(result);
  }

  return {
    reasoning: "Failed to parse agent response as JSON.",
    raw_output: originalText.slice(0, 2000),
    operations: [],
    status: "parse_error",
  };
}

function normalizeAgentResponse(response: any): any {
  if (typeof response.blackboard_entry === 'string') {
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

function generateToolsListText(manifest: DatabaseToolsManifest, exposeProject: boolean): string {
  const lines: string[] = [];
  
  lines.push("## DATABASE OPERATIONS\n");
  lines.push("You work by executing available tools to query and modify the PostgreSQL database. Each tool has specific parameters you must provide.\n");
  
  for (const [name, tool] of Object.entries(manifest.database_operations)) {
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
    lines.push("\n## PROJECT CONTEXT TOOLS (READ-ONLY)\n");
    lines.push("Use these tools to understand project requirements and design database schemas accordingly.\n");
    for (const [name, tool] of Object.entries(manifest.project_context_tools)) {
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
  }
  
  return lines.join("\n");
}

function generateResponseSchemaText(manifest: DatabaseToolsManifest, exposeProject: boolean): string {
  const allToolNames = [
    ...Object.keys(manifest.database_operations),
    ...(exposeProject ? Object.keys(manifest.project_context_tools) : [])
  ];
  
  return `When responding, structure your response as:
{
  "reasoning": "Your chain-of-thought reasoning about what to do next",
  "operations": [
    {
      "type": "${allToolNames[0] || "read_database_schema"}" | "${allToolNames.slice(1, 4).join('" | "')}" | ...,
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

function generateGrokSchema(manifest: DatabaseToolsManifest, exposeProject: boolean) {
  const allToolNames = [
    ...Object.keys(manifest.database_operations),
    ...(exposeProject ? Object.keys(manifest.project_context_tools) : [])
  ];
  
  const paramsProperties: Record<string, any> = {};
  const allTools = { ...manifest.database_operations, ...(exposeProject ? manifest.project_context_tools : {}) };
  
  for (const tool of Object.values(allTools)) {
    for (const [paramName, param] of Object.entries(tool.params)) {
      if (!paramsProperties[paramName]) {
        let jsonType: any = "string";
        if (param.type === "integer") jsonType = "integer";
        else if (param.type === "array") jsonType = "array";
        paramsProperties[paramName] = { type: jsonType, description: param.description };
      }
    }
  }
  
  return {
    type: "json_schema",
    json_schema: {
      name: "database_agent_response",
      strict: true,
      schema: {
        type: "object",
        properties: {
          reasoning: { type: "string", description: "Chain-of-thought reasoning" },
          operations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: allToolNames },
                params: { type: "object", description: "Operation-specific parameters", properties: paramsProperties },
              },
              required: ["type", "params"],
            },
          },
          blackboard_entry: {
            type: "object",
            properties: {
              entry_type: { type: "string", enum: ["planning", "progress", "decision", "reasoning", "next_steps", "reflection"] },
              content: { type: "string" },
            },
            required: ["entry_type", "content"],
          },
          status: { type: "string", enum: ["in_progress", "completed"] },
        },
        required: ["reasoning", "operations", "status", "blackboard_entry"],
      },
    },
  };
}

function generateClaudeSchema(manifest: DatabaseToolsManifest, exposeProject: boolean) {
  const allToolNames = [
    ...Object.keys(manifest.database_operations),
    ...(exposeProject ? Object.keys(manifest.project_context_tools) : [])
  ];
  
  const paramsProperties: Record<string, any> = {};
  const allTools = { ...manifest.database_operations, ...(exposeProject ? manifest.project_context_tools : {}) };
  
  for (const tool of Object.values(allTools)) {
    for (const [paramName, param] of Object.entries(tool.params)) {
      if (!paramsProperties[paramName]) {
        let jsonType: any = "string";
        if (param.type === "integer") jsonType = "integer";
        else if (param.type === "array") jsonType = "array";
        paramsProperties[paramName] = { type: jsonType, description: param.description };
      }
    }
  }
  
  return {
    name: "respond_with_actions",
    description: "Return your reasoning, database operations, and status as structured output.",
    input_schema: {
      type: "object",
      properties: {
        reasoning: { type: "string", description: "Chain-of-thought reasoning" },
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: allToolNames },
              params: { type: "object", description: "Operation-specific parameters", properties: paramsProperties },
            },
            required: ["type", "params"],
            additionalProperties: false,
          },
        },
        blackboard_entry: {
          type: "object",
          properties: {
            entry_type: { type: "string", enum: ["planning", "progress", "decision", "reasoning", "next_steps", "reflection"] },
            content: { type: "string" },
          },
          required: ["entry_type", "content"],
          additionalProperties: false,
        },
        status: { type: "string", enum: ["in_progress", "completed"] },
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

  let requestData: DatabaseAgentRequest;
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
    databaseId,
    connectionId,
    taskDescription,
    projectContext,
    maxIterations: requestedMaxIterations = 50,
    promptSections,
    customToolDescriptions,
    sessionId: existingSessionId,
    iteration: requestedIteration = 1,
    exposeProject = false,
  } = requestData;

  const isNewSession = !existingSessionId;
  const iteration = requestedIteration;

  console.log(`DatabaseAgent: ${isNewSession ? 'NEW' : 'CONTINUE'} session, iteration ${iteration}`);

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

  // Handle session
  let sessionId: string;
  let session: any;

  if (isNewSession) {
    try {
      const { data, error: sessionError } = await supabase.rpc("create_agent_session_with_token", {
        p_project_id: projectId,
        p_token: shareToken,
        p_mode: "task",
        p_task_description: taskDescription || "",
        p_agent_type: "database",
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

    await supabase.rpc("insert_agent_message_with_token", {
      p_session_id: sessionId,
      p_token: shareToken,
      p_role: "user",
      p_content: taskDescription || "",
      p_metadata: { projectContext, databaseId, connectionId },
    });

    console.log("Created new session:", sessionId);
  } else {
    sessionId = existingSessionId;
    try {
      const { data, error } = await supabase.rpc("get_agent_session_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
      });
      if (error) throw error;
      const sessionData = Array.isArray(data) ? data[0] : data;
      if (!sessionData) throw new Error("Session not found");
      session = sessionData;

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
  const manifest: DatabaseToolsManifest = {
    id: "database-agent-tools",
    name: "Database Agent Tools Manifest",
    version: "1.0.0",
    description: "Database operation tools",
    database_operations: {
      read_database_schema: { description: "Retrieve complete schema structure. Use FIRST before any modifications.", category: "discovery", enabled: true, params: { schemas: { type: "array", required: false, description: "Filter to specific schema names" } } },
      execute_sql: { description: "Execute SQL queries. DDL statements auto-captured as migrations.", category: "execute", enabled: true, params: { sql: { type: "string", required: true, description: "SQL to execute" } } },
      get_table_data: { description: "Retrieve sample data from a table.", category: "read", enabled: true, params: { schema: { type: "string", required: true, description: "Schema name" }, table: { type: "string", required: true, description: "Table name" }, limit: { type: "integer", required: false, description: "Row limit (default: 100)" }, offset: { type: "integer", required: false, description: "Offset (default: 0)" } } },
      get_table_structure: { description: "Get detailed column info for a table.", category: "read", enabled: true, params: { schema: { type: "string", required: true, description: "Schema name" }, table: { type: "string", required: true, description: "Table name" } } },
      get_definition: { description: "Get CREATE statement for a database object.", category: "read", enabled: true, params: { object_type: { type: "string", required: true, description: "Type: table, view, function, trigger, sequence, type, index" }, schema: { type: "string", required: true, description: "Schema name" }, name: { type: "string", required: true, description: "Object name" } } },
    },
    project_context_tools: {
      project_inventory: { description: "Returns counts and previews for ALL project elements.", category: "project", enabled: true, params: {} },
      project_category: { description: "Load ALL items from a specific category.", category: "project", enabled: true, params: { category: { type: "string", required: true, description: "Category name" } } },
    },
  };

  // Merge custom tool descriptions
  if (customToolDescriptions) {
    if (customToolDescriptions.database_operations) {
      for (const [toolName, desc] of Object.entries(customToolDescriptions.database_operations)) {
        if (manifest.database_operations[toolName]) {
          manifest.database_operations[toolName].description = desc;
        }
      }
    }
  }

  const MAX_ITERATIONS = Math.min(Math.max(requestedMaxIterations, 1), 100);

  // Load conversation history
  let conversationHistory: Array<{ role: string; content: string }> = [];
  
  if (!isNewSession) {
    if (session?.task_description) {
      conversationHistory.push({ role: "user", content: `Task: ${session.task_description}` });
    }
    
    const { data: previousMessages } = await supabase.rpc("get_agent_messages_with_token", {
      p_token: shareToken,
      p_project_id: projectId,
      p_session_id: sessionId,
      p_limit: 50,
      p_offset: 0,
      p_since: null,
      p_agent_type: "database",
    });

    if (previousMessages && previousMessages.length > 0) {
      const sortedMessages = [...previousMessages].reverse();
      for (const msg of sortedMessages) {
        if (msg.role === 'user') {
          conversationHistory.push({ role: "user", content: msg.content });
        } else if (msg.role === 'system') {
          conversationHistory.push({ role: "user", content: `[System]: ${msg.content}` });
        } else {
          try {
            const parsed = JSON.parse(msg.content);
            conversationHistory.push({ role: "assistant", content: parsed.reasoning || msg.content });
          } catch {
            conversationHistory.push({ role: "assistant", content: msg.content });
          }
        }
      }
    }
  }

  // Load blackboard
  const { data: blackboardEntries } = await supabase.rpc("get_blackboard_entries_with_token", {
    p_session_id: sessionId,
    p_token: shareToken,
    p_limit: 20,
    p_offset: 0,
  });

  let blackboardContent = "";
  if (blackboardEntries && blackboardEntries.length > 0) {
    blackboardContent = "\n=== YOUR PLANNING JOURNAL (Most Recent First) ===\n" +
      [...blackboardEntries].reverse().map((e: any) => `[${e.entry_type}]: ${e.content}`).join("\n") +
      "\n=== END JOURNAL ===\n";
  }

  // Build system prompt
  const toolsListText = generateToolsListText(manifest, exposeProject);
  const responseSchemaText = generateResponseSchemaText(manifest, exposeProject);

  let systemPrompt = `You are Database Agent, an autonomous PostgreSQL database administrator.

Your task is to help with database operations by executing SQL and managing schema changes.

${toolsListText}

=== RESPONSE FORMAT ===
CRITICAL: Return ONLY raw JSON. Do NOT wrap your response in markdown code blocks.
Do NOT use \`\`\`json or \`\`\` formatting. Output pure JSON directly.

${responseSchemaText}

=== CRITICAL RULES ===
1. ALWAYS call read_database_schema first to understand the database
2. All DDL (CREATE, ALTER, DROP) is auto-captured as migrations
3. Use IF EXISTS/IF NOT EXISTS for idempotent operations
4. Work autonomously - chain operations until complete
5. ALWAYS include a blackboard_entry

=== ITERATION STATUS ===
Current iteration: ${iteration} of ${MAX_ITERATIONS}

${blackboardContent}`;

  if (projectContext) {
    systemPrompt += "\n\n=== PROJECT CONTEXT ===\n" + JSON.stringify(projectContext, null, 2);
  }

  // SSE streaming response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendSSE = (event: SSEEventType, data: any) => {
        // Match coding-agent-orchestrator format: embed type in data payload
        const message = `data: ${JSON.stringify({ type: event, ...data })}\n\n`;
        try {
          controller.enqueue(encoder.encode(message));
        } catch (e) {
          console.error("Failed to send SSE event:", e);
        }
      };

      const heartbeatInterval = setInterval(() => {
        try {
          sendSSE('heartbeat' as any, { timestamp: Date.now() });
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 3000);

      try {
        sendSSE('session_created', { sessionId, iteration });

        // Build conversation for LLM
        const conversationForLLM = [...conversationHistory];
        if (isNewSession && taskDescription) {
          conversationForLLM.push({ role: "user", content: taskDescription });
        }

        // Call LLM
        let rawOutputText = "";
        const decoder = new TextDecoder();
        const fullInputPrompt = systemPrompt + "\n\n" + conversationForLLM.map(m => `${m.role}: ${m.content}`).join("\n");

        if (selectedModel.startsWith("gemini")) {
          const messages = conversationForLLM.map((msg) => ({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }],
          }));

          const llmResponse = await fetch(apiEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: messages,
              generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
            }),
          });

          if (!llmResponse.ok) {
            const errorText = await llmResponse.text();
            console.error("Gemini API error:", llmResponse.status, errorText);
            
            // Log failed API call for debugging
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
            
            throw new Error(`Gemini API error: ${errorText}`);
          }

          const reader = llmResponse.body?.getReader();
          if (!reader) throw new Error("No response body reader");
          let textBuffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            textBuffer += decoder.decode(value, { stream: true });
            let newlineIndex: number;
            while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
              let line = textBuffer.slice(0, newlineIndex);
              textBuffer = textBuffer.slice(newlineIndex + 1);
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
              } catch {
                // Ignore parse errors
              }
            }
          }
          reader.releaseLock();

        } else if (selectedModel.startsWith("claude")) {
          const messages = conversationForLLM.map((msg) => ({ role: msg.role, content: msg.content }));

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
            
            // Log failed API call for debugging
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
            
            throw new Error(`Claude API error: ${errorText}`);
          }

          const reader = llmResponse.body?.getReader();
          if (!reader) throw new Error("No response body reader");
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
              if (!line.startsWith('data: ')) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr || jsonStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(jsonStr);
                let text = "";
                if (parsed.type === "content_block_delta") {
                  if (parsed.delta?.type === "input_json_delta") {
                    const partialJson = parsed.delta.partial_json || "";
                    claudeToolInput += partialJson;
                    text = partialJson;
                  }
                }
                if (text) {
                  rawOutputText += text;
                  sendSSE('llm_streaming', { iteration, charsReceived: rawOutputText.length, delta: text });
                }
              } catch {
                // Ignore
              }
            }
          }
          reader.releaseLock();
          if (claudeToolInput) rawOutputText = claudeToolInput;

        } else if (selectedModel.startsWith("grok")) {
          const messages = [
            { role: "system", content: systemPrompt },
            ...conversationForLLM.map((msg) => ({ role: msg.role, content: msg.content })),
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
            
            // Log failed API call for debugging
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
            
            throw new Error(`Grok API error: ${errorText}`);
          }

          const reader = llmResponse.body?.getReader();
          if (!reader) throw new Error("No response body reader");
          let textBuffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            textBuffer += decoder.decode(value, { stream: true });
            let newlineIndex: number;
            while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
              let line = textBuffer.slice(0, newlineIndex);
              textBuffer = textBuffer.slice(newlineIndex + 1);
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
              } catch {
                // Ignore
              }
            }
          }
          reader.releaseLock();
        }

        sendSSE('llm_complete', { iteration, totalChars: rawOutputText.length });

        // Parse response
        const agentResponse = parseAgentResponseText(rawOutputText);

        // Log to LLM logs
        await supabase.rpc("insert_agent_llm_log_with_token", {
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

        // Handle blackboard entry
        if (agentResponse.blackboard_entry) {
          const validEntryTypes = ['planning', 'progress', 'decision', 'reasoning', 'next_steps', 'reflection'];
          let entryType = agentResponse.blackboard_entry.entry_type || "progress";
          if (typeof entryType !== 'string' || !validEntryTypes.includes(entryType)) {
            entryType = 'progress';
          }
          
          await supabase.rpc("add_blackboard_entry_with_token", {
            p_session_id: sessionId,
            p_token: shareToken,
            p_entry_type: entryType,
            p_content: agentResponse.blackboard_entry.content || "",
            p_metadata: null,
          });
        }

        // Log agent message
        await supabase.rpc("insert_agent_message_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_role: "agent",
          p_content: rawOutputText,
          p_metadata: { reasoning: agentResponse.reasoning, status: agentResponse.status, iteration },
        });

        // Execute operations
        const operationResults = [];
        const operations = agentResponse.operations || [];

        console.log(`[DatabaseAgent] Executing ${operations.length} operations`);

        for (let opIndex = 0; opIndex < operations.length; opIndex++) {
          const op = operations[opIndex];
          if (!op || !op.params) op.params = {};
          console.log("Executing operation:", op.type);

          sendSSE('operation_start', { iteration, operation: op.type, operationIndex: opIndex, totalOperations: operations.length });

          const { data: logEntry } = await supabase.rpc("log_agent_operation_with_token", {
            p_session_id: sessionId,
            p_operation_type: op.type,
            p_file_path: null,
            p_status: "in_progress",
            p_details: op.params,
            p_token: shareToken,
          });

          try {
            let result: any;

            switch (op.type) {
              case "read_database_schema": {
                const { data, error } = await supabase.functions.invoke("manage-database", {
                  body: {
                    action: "get_schema",
                    databaseId: databaseId || null,
                    connectionId: connectionId || null,
                    shareToken,
                  },
                });
                if (error) throw error;
                result = data;
                break;
              }

              case "execute_sql": {
                const sqlContent = op.params.sql;
                const { data, error } = await supabase.functions.invoke("manage-database", {
                  body: {
                    action: "execute_sql",
                    databaseId: databaseId || null,
                    connectionId: connectionId || null,
                    shareToken,
                    sql: sqlContent,
                  },
                });
                if (error) throw error;
                result = data;

                // Auto-capture DDL as migrations
                const statements = splitSqlStatements(sqlContent);
                for (const stmt of statements) {
                  if (isDDLStatement(stmt)) {
                    const { schema, name } = extractObjectName(stmt);
                    try {
                      await supabase.rpc("insert_migration_with_token", {
                        p_database_id: databaseId || null,
                        p_connection_id: connectionId || null,
                        p_sql_content: stmt,
                        p_statement_type: getStatementType(stmt),
                        p_object_type: getObjectType(stmt),
                        p_token: shareToken,
                        p_object_schema: schema || 'public',
                        p_object_name: name,
                      });
                      console.log(`[DatabaseAgent] Migration captured: ${getStatementType(stmt)} ${getObjectType(stmt)}`);
                    } catch (e) {
                      console.error("[DatabaseAgent] Failed to capture migration:", e);
                    }
                  }
                }
                break;
              }

              case "get_table_data": {
                const { data, error } = await supabase.functions.invoke("manage-database", {
                  body: {
                    action: "get_table_data",
                    databaseId: databaseId || null,
                    connectionId: connectionId || null,
                    shareToken,
                    schema: op.params.schema,
                    table: op.params.table,
                    limit: op.params.limit || 100,
                    offset: op.params.offset || 0,
                  },
                });
                if (error) throw error;
                result = data;
                break;
              }

              case "get_table_structure": {
                const { data, error } = await supabase.functions.invoke("manage-database", {
                  body: {
                    action: "get_table_structure",
                    databaseId: databaseId || null,
                    connectionId: connectionId || null,
                    shareToken,
                    schema: op.params.schema,
                    table: op.params.table,
                  },
                });
                if (error) throw error;
                result = data;
                break;
              }

              case "get_definition": {
                const actionMap: Record<string, string> = {
                  'table': 'get_table_definition',
                  'view': 'get_view_definition',
                  'function': 'get_function_definition',
                  'trigger': 'get_trigger_definition',
                  'index': 'get_index_definition',
                  'sequence': 'get_sequence_info',
                  'type': 'get_type_definition',
                };
                const action = actionMap[op.params.object_type] || 'get_table_definition';
                const { data, error } = await supabase.functions.invoke("manage-database", {
                  body: {
                    action,
                    databaseId: databaseId || null,
                    connectionId: connectionId || null,
                    shareToken,
                    schema: op.params.schema,
                    name: op.params.name,
                    table: op.params.name,
                  },
                });
                if (error) throw error;
                result = data;
                break;
              }

              case "project_inventory": {
                if (!exposeProject) {
                  throw new Error("project_inventory requires exposeProject enabled");
                }
                const { data, error } = await supabase.rpc("get_project_inventory_with_token", {
                  p_project_id: projectId,
                  p_token: shareToken,
                });
                if (error) throw error;
                result = { data };
                break;
              }

              case "project_category": {
                if (!exposeProject) {
                  throw new Error("project_category requires exposeProject enabled");
                }
                const { data, error } = await supabase.rpc("get_project_category_with_token", {
                  p_project_id: projectId,
                  p_category: op.params.category,
                  p_token: shareToken,
                });
                if (error) throw error;
                result = { data };
                break;
              }

              default:
                throw new Error(`Unknown operation type: ${op.type}`);
            }

            await supabase.rpc("update_agent_operation_status_with_token", {
              p_operation_id: logEntry.id,
              p_status: "completed",
              p_token: shareToken,
            });

            operationResults.push({ type: op.type, success: true, data: result?.data || result });
            sendSSE('operation_complete', { iteration, operation: op.type, success: true });
          } catch (error) {
            console.error("Operation failed:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);

            await supabase.rpc("update_agent_operation_status_with_token", {
              p_operation_id: logEntry.id,
              p_status: "failed",
              p_error_message: errorMessage,
              p_token: shareToken,
            });

            operationResults.push({ type: op.type, success: false, error: errorMessage });
            sendSSE('operation_complete', { iteration, operation: op.type, success: false, error: errorMessage });
          }
        }

        // Log operation results as system message for context
        const summarizedResults = operationResults.map((r: any) => {
          const summary: any = { type: r.type, success: r.success };
          if (r.error) summary.error = r.error;
          if (r.success && r.data) {
            switch (r.type) {
              case "read_database_schema":
                summary.summary = `Retrieved schema with ${r.data?.schemas?.length || 0} schemas`;
                if (r.data?.schemas) {
                  summary.schemas = r.data.schemas.map((s: any) => ({
                    name: s.name,
                    tables: s.tables?.length || 0,
                    views: s.views?.length || 0,
                  }));
                }
                break;
              case "execute_sql":
                summary.summary = `Executed SQL: ${r.data?.rowCount || 0} rows affected`;
                break;
              case "get_table_data":
                summary.summary = `Retrieved ${r.data?.rows?.length || 0} rows`;
                break;
              case "get_table_structure":
                summary.summary = `Retrieved ${r.data?.columns?.length || 0} columns`;
                break;
              default:
                summary.summary = "Completed";
            }
          }
          return summary;
        });

        await supabase.rpc("insert_agent_message_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_role: "system",
          p_content: JSON.stringify(summarizedResults),
          p_metadata: { hidden: true, operation_results: true },
        });

        // Determine if completed
        const isCompleted = agentResponse.status === "completed";

        if (isCompleted) {
          await supabase.rpc("update_agent_session_status_with_token", {
            p_session_id: sessionId,
            p_status: "completed",
            p_token: shareToken,
          });
        }

        sendSSE('iteration_complete', {
          sessionId,
          iteration,
          status: isCompleted ? 'completed' : 'in_progress',
          reasoning: agentResponse.reasoning,
          operationCount: operations.length,
          operationResults: summarizedResults,
        });

        clearInterval(heartbeatInterval);
        controller.close();

      } catch (error) {
        clearInterval(heartbeatInterval);
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Agent error:", errorMessage);
        sendSSE('error', { error: errorMessage, sessionId, iteration });
        
        await supabase.rpc("update_agent_session_status_with_token", {
          p_session_id: sessionId,
          p_status: "failed",
          p_token: shareToken,
        });
        
        controller.close();
      }
    }
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
