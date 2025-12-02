import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TaskRequest {
  projectId: string;
  repoId: string;
  taskDescription: string;
  attachedFiles: Array<{ id: string; path: string }>;
  projectContext: any;
  shareToken: string;
  mode: 'task' | 'iterative_loop' | 'continuous_improvement';
  autoCommit?: boolean;
  chatHistory?: string;
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
      .replace(/^[\s\n]*here.?is.?the.?json.?[:\s]*/i, '')
      .replace(/^[\s\n]*json[:\s]*/i, '')
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
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
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
    status: "parse_error"
  };
}

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
    } = requestData;

    console.log("Starting CodingAgent task:", { projectId, mode, taskDescription });

    // Get project settings for API key and model selection
    const { data: project, error: projectError } = await supabase.rpc(
      "get_project_with_token",
      {
        p_project_id: projectId,
        p_token: shareToken,
      }
    );

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
    const { data: session, error: sessionError } = await supabase.rpc(
      "create_agent_session_with_token",
      {
        p_project_id: projectId,
        p_mode: mode,
        p_task_description: taskDescription,
        p_token: shareToken,
      }
    );

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
    console.log("Created session:", session.id);

    // Load instruction manifest
    const manifest = {
      file_operations: {
        list_files: { description: "List all files with metadata (id, path, updated_at). MUST be called FIRST to load file structure." },
        wildcard_search: { description: "Multi-term search across all files. Returns ranked results by match count. Use for finding files by concept." },
        search: { description: "Search file paths and content by single keyword" },
        read_file: { description: "Read complete content of a single file. Returns content WITH LINE NUMBERS prefixed as <<N>>." },
        edit_lines: { description: "Edit specific line range in a file and stage the change. Use line numbers from <<N>> prefix in read_file output." },
        create_file: { description: "Create new file and stage as add operation" },
        delete_file: { description: "Delete file and stage as delete operation" },
        move_file: { description: "Move or rename file to a new path (handles directory moves properly)" },
      },
    } as const;

    // Describe attached files by id and path only (let the agent read them via tools)
    let attachedFilesSection = "";
    if (attachedFiles && attachedFiles.length > 0) {
      const attachedList = attachedFiles
        .map((f) => `- ${f.path} (file_id: ${f.id})`)
        .join("\n");
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
          (meta.scope ? `Scope: ${meta.scope}\n` : "")
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
      
      contextSummary = parts.join("\n\n");
    }

    // Build chat history section
    let chatHistorySection = "";
    if (chatHistory && chatHistory.trim()) {
      chatHistorySection = `\n\n📜 RECENT CONVERSATION CONTEXT:\n${chatHistory}\n--- END CONVERSATION CONTEXT ---`;
    }


    // Build system prompt
    const systemPrompt = `CRITICAL: You MUST respond with ONLY valid JSON. No prose, no markdown, no explanations outside the JSON structure.

You are CodingAgent, an autonomous coding agent with the following capabilities:

${JSON.stringify(manifest.file_operations, null, 2)}

You can execute these file operations by responding with structured JSON containing the operations to perform.

Your task mode is: ${mode}
Auto-commit enabled: ${autoCommit}

Project Context:
${contextSummary}${attachedFilesSection}${chatHistorySection}

⚠️ CRITICAL WARNING ABOUT FILE IDs FROM CHAT HISTORY:
Any file IDs mentioned in the RECENT CONVERSATION CONTEXT above are from PREVIOUS sessions and are STALE/INVALID.
File IDs change when:
- Files are committed (staging is cleared, new IDs assigned)
- Files are deleted and re-created
- New agent sessions start

NEVER use file IDs from chat history directly!
ALWAYS call list_files or wildcard_search FIRST to get CURRENT, VALID file IDs for THIS session.
Even if chat history shows "file_id: abc123", that ID is INVALID - you MUST get fresh IDs.

CRITICAL INSTRUCTION FOR ATTACHED FILES:
${attachedFiles && attachedFiles.length > 0 
  ? `The user has attached specific file(s) with their file_id values listed above. DO NOT call list_files first - use read_file directly with the provided file_id values to work with these files immediately.`
  : `Your FIRST operation MUST be list_files or wildcard_search to get CURRENT file IDs.
File IDs from chat history are STALE and INVALID - never reuse them!
{
  "type": "list_files",
  "params": { "path_prefix": null }
}
This loads the complete file structure with all CURRENT file IDs and paths. You CANNOT edit, read, or delete files without getting their IDs from THIS session first.`
}

When responding, structure your response as:
{
  "reasoning": "Your chain-of-thought reasoning about what to do next",
  "operations": [
    {
      "type": "list_files",
      "params": { "path_prefix": null }
    },
    {
      "type": "wildcard_search",
      "params": { "query": "multiple search terms separated by spaces (e.g., 'weather api fetch')" }
    },
    {
      "type": "search",
      "params": { "keyword": "single keyword to search in paths and content" }
    },
    {
      "type": "read_file",
      "params": { "file_id": "UUID from list_files or search results" }
    },
    {
      "type": "edit_lines",
      "params": {
        "file_id": "UUID from list_files or search results",
        "start_line": 1,
        "end_line": 5,
        "new_content": "replacement text"
      }
      // NOTE: You MUST call read_file first to see current content and count lines accurately
    },
    {
      "type": "create_file",
      "params": { 
        "path": "relative/path/to/file.ext",
        "content": "file content"
      }
    },
    {
      "type": "delete_file",
      "params": { "file_id": "UUID from list_files or search results" }
    },
    {
      "type": "move_file",
      "params": { 
        "file_id": "UUID from list_files or search results",
        "new_path": "src/composables/file.ext"
      }
    }
  ],
  "blackboard_entry": {
    "entry_type": "planning" | "progress" | "decision" | "reasoning" | "next_steps" | "reflection",
    "content": "Your memory/reflection for this step"
  },
  "status": "in_progress" | "completed" | "requires_commit"
}

READ_FILE LINE NUMBER FORMAT:
When you call read_file, the content is returned with line numbers prefixed as <<N>> where N is the line number.
Example output from read_file:
<<1>> function Example() {
<<2>>   return <div>Hello</div>;
<<3>> }
<<4>> 
<<5>> export default Example;

IMPORTANT LINE NUMBER RULES:
- The <<N>> markers are for YOUR REFERENCE ONLY - NEVER include <<N>> in your edit_lines new_content
- When specifying start_line and end_line for edit_lines, use the numbers shown in <<N>>
- Line 1 is always the first line of the file
- total_lines in the response tells you the file's total line count

CRITICAL RULES:
1. If user attached files (with file_id provided), use read_file directly with those IDs - DO NOT call list_files first
2. If no files attached, start with EITHER list_files OR wildcard_search (if you have keywords to search)
3. Use wildcard_search when you have concepts/keywords to find (e.g., "authentication login session")
4. Use file_id from list_files, wildcard_search, or search results for read_file, edit_lines, delete_file, and move_file operations
5. Only use path for create_file operation
6. Work autonomously by chaining operations together - DO NOT STOP AFTER A SINGLE OPERATION
7. Set status to "in_progress" when you need to continue with more operations
8. Set status to "requires_commit" when you've made changes ready to be staged
9. Set status to "completed" ONLY after EXHAUSTIVELY completing the user's request AND performing final validation
10. MANDATORY BEFORE EDIT_LINES: You MUST call read_file first to see the numbered content and use those line numbers
11. For edit_lines: Use the <<N>> line numbers from read_file output - do NOT guess line numbers
12. CRITICAL AFTER EDIT_LINES: The operation result includes a 'verification' object showing the file's actual state after your edit. Always check verification.content_sample to confirm your edit worked as intended. If the result is unexpected, read_file again to see the full current state.
13. For JSON/structured files: Ensure your edits maintain valid structure (no duplicate keys, proper syntax)
14. NEVER include <<N>> markers in your new_content - they are display-only for your reference

EDIT_LINES OPERATION MODES - CRITICAL:

1. REPLACE LINES (delete existing + insert new):
   - Set start_line and end_line to the range you want to REPLACE
   - Lines start_line through end_line (inclusive) will be DELETED
   - new_content will be INSERTED in their place
   - Example: start_line=10, end_line=15 replaces lines 10-15 with new_content

2. INSERT ONLY (no deletion, preserves all existing content):
   - Set end_line = start_line - 1 (end BEFORE start)
   - NO lines will be deleted
   - new_content will be INSERTED BEFORE the specified start_line
   - Example: start_line=23, end_line=22 inserts new_content at line 23, shifting existing lines down
   - USE THIS when adding new code without removing anything

3. APPEND TO END OF FILE:
   - Set start_line = total_lines + 1 (beyond file length)
   - System will cap and append at end
   - Example: 50-line file, start_line=51, end_line=50 appends after line 50

COMMON MISTAKES TO AVOID:
- DO NOT use a large end_line range if you only want to INSERT - this DELETES content
- If adding new code WITHOUT removing existing code, ALWAYS use end_line = start_line - 1
- When inserting at line 23, use start_line=23, end_line=22 (NOT end_line=23 which would delete line 23)

ITERATION PHILOSOPHY - DRIVE DEEP, NOT SHALLOW:
You have up to 30 iterations available. USE THEM. The typical task requires 20-30 iterations to complete properly.
- 1-5 iterations: Initial exploration, understanding requirements, planning approach
- 6-15 iterations: Core implementation work, making primary changes
- 16-25 iterations: Refinement, edge cases, additional features, optimization
- 26-30 iterations: Final validation, testing, documentation, verification

DO NOT BE SATISFIED WITH QUICK WINS. Push yourself to:
- Implement the feature completely, not just the basics
- Handle edge cases and error conditions
- Add proper error handling and validation
- Consider related functionality that should be updated
- Verify your changes work correctly by reading back what you changed
- Think about what could break and proactively fix it
- Document your changes if appropriate

COMPLETION VALIDATION - BE EXTREMELY CRITICAL:
Before setting status="completed", you MUST perform a final verification check:

STEP 1 - REVIEW CURRENT STATE:
Call list_files to see ALL files that currently exist in the project.
Review what files you created, edited, or deleted in this session.

STEP 2 - COMPARE AGAINST ORIGINAL TASK:
Re-read the original user task at the top of this conversation.
Ask yourself: "Does the current file state satisfy EVERY aspect of the user's request?"

STEP 3 - IDENTIFY GAPS:
List out what the user asked for vs. what currently exists:
- Are there features mentioned in the task that aren't implemented?
- Are there files that should exist but don't?
- Are there edge cases or error handling that's missing?
- Are there related files that need updating but weren't touched?

STEP 4 - MAKE THE DECISION:
If ANY gaps exist, set status="in_progress" and continue working.
If you're uncertain whether you're done, YOU'RE NOT DONE - continue working.

ONLY mark status="completed" when ALL of the following are true:
1. You have called list_files to verify current project state
2. You have re-read the original task and confirmed every requirement is met
3. You have made ALL necessary code changes (not just planned them)
4. You have verified your changes by reading back the modified files
5. You have handled edge cases and error conditions
6. You have considered impact on related code and updated it if needed
7. You would confidently show this work to the user as "finished"

CRITICAL: Before marking complete, you MUST execute this verification workflow:
{
  "reasoning": "I think I'm done, but let me verify by checking the file list against the original task...",
  "operations": [
    {
      "type": "list_files",
      "params": { "path_prefix": null }
    }
  ],
  "status": "in_progress"  // NEVER mark complete without this verification step first
}

Then in the NEXT iteration after seeing the file list, compare it to the original task and decide if you're truly done.

Think step-by-step and continue iterating aggressively until the task is EXHAUSTIVELY complete.

RESPONSE FORMAT ENFORCEMENT:
Your entire response must be a single valid JSON object. Do not include ANY text before or after the JSON.

CORRECT FORMAT:
{"reasoning": "...", "operations": [...], "status": "..."}

INCORRECT (DO NOT DO):
Here is my response: {"reasoning": "..."}
I will now... {"reasoning": "..."}
\`\`\`json
{"reasoning": "..."}
\`\`\`

Start your response with { and end with }. Nothing else.`;


    // Autonomous iteration loop
    const MAX_ITERATIONS = 30;
    let iteration = 0;
    let conversationHistory: Array<{ role: string; content: string }> = [];
    let finalStatus = "running";
    let allOperationResults: any[] = [];

    conversationHistory.push({ role: "user", content: `Task: ${taskDescription}` });

    while (iteration < MAX_ITERATIONS) {
      // Check if abort was requested before starting this iteration
      const { data: sessionCheck, error: sessionCheckError } = await supabase.rpc(
        "get_agent_session_with_token",
        {
          p_session_id: sessionId,
          p_token: shareToken,
        }
      );
      
      if (sessionCheckError) {
        console.error("Error checking session status:", sessionCheckError);
      } else if (sessionCheck && sessionCheck.length > 0) {
        const session = sessionCheck[0];
        if (session.abort_requested || session.status === 'aborted') {
          console.log("Abort requested, stopping iteration loop");
          finalStatus = "aborted";
          break;
        }
      }
      
      iteration++;
      console.log(`\n=== Iteration ${iteration} ===`);

      // Call LLM based on provider
      let llmResponse: any;

      if (selectedModel.startsWith("gemini")) {
        // Gemini API with system instruction
        const contents = conversationHistory.map((msg) => ({
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
        // Anthropic API
        const messages = conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        llmResponse = await fetch(apiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: modelName,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages,
          }),
        });
      } else if (selectedModel.startsWith("grok")) {
        // xAI API
        const messages = [
          { role: "system", content: systemPrompt },
          ...conversationHistory.map((msg) => ({
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
          }),
        });
      }

      if (!llmResponse?.ok) {
        const errorText = await llmResponse?.text();
        console.error("LLM API error:", llmResponse?.status, errorText);
        
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

      // Parse LLM response
      let agentResponse: any;
      if (selectedModel.startsWith("gemini")) {
        const text = llmData.candidates[0].content.parts[0].text as string;
        agentResponse = parseAgentResponseText(text);
      } else if (selectedModel.startsWith("claude")) {
        const text = llmData.content[0].text as string;
        agentResponse = parseAgentResponseText(text);
      } else if (selectedModel.startsWith("grok")) {
        const text = llmData.choices[0].message.content as string;
        agentResponse = parseAgentResponseText(text);
      }

      console.log("Parsed agent response:", agentResponse);

      // Log agent response to database
      await supabase.rpc("insert_agent_message_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_role: "agent",
        p_content: JSON.stringify({
          reasoning: agentResponse.reasoning,
          operations: agentResponse.operations,
          status: agentResponse.status,
        }),
        p_metadata: { iteration },
      });

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
      for (const op of agentResponse.operations || []) {
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
 
        try {
          let result;
          
          switch (op.type) {
            case "list_files":
              result = await supabase.rpc("agent_list_files_by_path_with_token", {
                p_repo_id: repoId,
                p_token: shareToken,
                p_path_prefix: op.params.path_prefix || null,
              });
              break;
            
            case "search":
              result = await supabase.rpc("agent_search_files_with_token", {
                p_project_id: projectId,
                p_keyword: op.params.keyword,
                p_token: shareToken,
              });
              break;
              
            case "wildcard_search":
              // Split query into search terms (filter out very short terms)
              const searchTerms = (op.params.query || "")
                .toLowerCase()
                .split(/\s+/)
                .filter((term: string) => term.length > 2);
              
              if (searchTerms.length === 0) {
                result = { data: [], error: null };
              } else {
                result = await supabase.rpc("agent_wildcard_search_with_token", {
                  p_project_id: projectId,
                  p_token: shareToken,
                  p_search_terms: searchTerms,
                });
              }
              break;
              
            case "read_file":
              result = await supabase.rpc("agent_read_file_with_token", {
                p_file_id: op.params.file_id,
                p_token: shareToken,
              });
              
              // Add line numbers to content for LLM clarity
              if (result.data?.[0]?.content) {
                const lines = result.data[0].content.split('\n');
                const numberedContent = lines
                  .map((line: string, idx: number) => `<<${idx + 1}>> ${line}`)
                  .join('\n');
                
                result.data[0].numbered_content = numberedContent;
                result.data[0].total_lines = lines.length;
                // Replace content with numbered version for agent consumption
                result.data[0].content = numberedContent;
              }
              break;
              
            case "edit_lines":
              // Read file using agent function that checks both repo_files and repo_staging
              console.log(`[AGENT] edit_lines: Reading file ${op.params.file_id}`);
              const { data: fileData, error: readError } = await supabase.rpc("agent_read_file_with_token", {
                p_file_id: op.params.file_id,
                p_token: shareToken,
              });
              
              if (readError) {
                console.error(`[AGENT] edit_lines: Read error:`, readError);
                throw new Error(`Failed to read file ${op.params.file_id}: ${readError.message}`);
              }
              
              if (!fileData || fileData.length === 0) {
                console.error(`[AGENT] edit_lines: File not found: ${op.params.file_id}`);
                throw new Error(`File not found: ${op.params.file_id}. Cannot edit. The file may not exist or may have been deleted.`);
              }
              
              console.log(`[AGENT] edit_lines: File found: ${fileData[0].path}, content length: ${fileData[0].content?.length || 0}`);
              
              if (fileData?.[0]) {
                // Check if file is already staged to accumulate edits correctly
                const { data: stagedChanges } = await supabase.rpc("get_staged_changes_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                });
                
                const existingStaged = stagedChanges?.find((s: any) => s.file_path === fileData[0].path);
                
                // Use staged new_content as base if exists, otherwise use committed content
                const baseContent = existingStaged ? existingStaged.new_content : fileData[0].content;
                
                // Validate line numbers against current content
                const baseLines = baseContent.split('\n');
                const totalBaseLines = baseLines.length;
                
                // Cap start_line to allow appending at end of file
                // If start_line is beyond file length, treat as append (start at last line + 1)
                let startIdx = op.params.start_line - 1;
                if (startIdx > totalBaseLines) {
                  console.log(`[AGENT] edit_lines: start_line ${op.params.start_line} exceeds file length ${totalBaseLines}, capping to append position`);
                  startIdx = totalBaseLines; // Will append after last line
                }
                
                // Cap end_line to actual file length (allows agent to be less precise)
                let endIdx = op.params.end_line - 1;
                if (endIdx >= totalBaseLines) {
                  console.log(`[AGENT] edit_lines: end_line ${op.params.end_line} exceeds file length ${totalBaseLines}, capping to ${totalBaseLines}`);
                  endIdx = totalBaseLines - 1;
                }
                
                // Only validate that start_line is not negative
                if (startIdx < 0) {
                  throw new Error(
                    `Invalid start line: start_line=${op.params.start_line}. ` +
                    `Line numbers must be positive (1 or greater).`
                  );
                }
                
                // INSERT operation: when start > end (e.g., start=10, end=9), 
                // this means "insert at position 10 with 0 deletions"
                // The splice below handles this correctly: splice(startIdx, 0, ...newContentLines)
                if (startIdx > endIdx && startIdx < totalBaseLines) {
                  console.log(
                    `[AGENT] edit_lines: INSERT operation (start ${startIdx + 1} > end ${endIdx + 1}), ` +
                    `inserting at line ${startIdx + 1} with 0 deletions`
                  );
                }
                
                // Now check for pure append (when start is BEYOND file length)
                // This only triggers when startIdx >= totalBaseLines (truly appending after last line)
                if (startIdx >= totalBaseLines) {
                  console.log(
                    `[AGENT] edit_lines: Pure append operation detected (start ${startIdx + 1} beyond file length ${totalBaseLines}), appending to end of file`
                  );
                  // Append: splice at totalBaseLines with 0 deletions
                  startIdx = totalBaseLines;
                  endIdx = totalBaseLines - 1; // Will result in 0 deletions
                }
                
                // Apply edit to the correct base content
                // Strip any accidental <<N>> markers from new_content (agent shouldn't include them, but safeguard)
                let cleanedNewContent = op.params.new_content.replace(/^<<\d+>>\s*/gm, '');
                
                // Split new_content into lines (agent provides content with \n separators)
                const newContentLines = cleanedNewContent.split('\n');
                // Remove trailing empty line if new_content ended with \n
                if (newContentLines.length > 0 && newContentLines[newContentLines.length - 1] === '') {
                  newContentLines.pop();
                }
                
                // Calculate how many lines to remove (0 for pure append)
                const linesToRemove = startIdx > endIdx ? 0 : endIdx - startIdx + 1;
                baseLines.splice(startIdx, linesToRemove, ...newContentLines);
                let finalContent = baseLines.join('\n');
                let jsonParseWarning: string | undefined;
                
                // For JSON files, validate and normalize the result to avoid structural issues like duplicate keys
                const isJsonFile = fileData[0].path.endsWith('.json');
                if (isJsonFile) {
                  try {
                    const parsed = JSON.parse(finalContent);
                    // Re-stringify to canonical JSON (no duplicate keys, consistent formatting)
                    finalContent = JSON.stringify(parsed, null, 2) + '\n';
                  } catch (parseError: any) {
                    // Allow invalid JSON edits to be staged - agent may need multiple iterations to fix complex issues
                    // Log the error but don't fail the operation
                    console.warn(
                      `Warning: Edit resulted in invalid JSON for ${fileData[0].path}. ` +
                      `Lines ${op.params.start_line}-${op.params.end_line}. ` +
                      `Error: ${parseError?.message || String(parseError)}. ` +
                      `Staging anyway to allow iterative fixes.`
                    );
                    // Store warning to include in result after RPC call
                    jsonParseWarning = parseError?.message || String(parseError);
                  }
                }
                
                // Stage the change (UPSERT will preserve original old_content baseline)
                console.log(`[AGENT] edit_lines: Staging edit for ${fileData[0].path}, lines ${op.params.start_line}-${op.params.end_line}`);
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
                  operation_type: 'edit',
                  file_path: fileData[0].path,
                });
                
                // CRITICAL: Re-read the file after edit to verify the change was applied correctly
                // This helps the agent see the actual current state for subsequent operations
                const { data: verifyData, error: verifyError } = await supabase.rpc(
                  "agent_read_file_with_token",
                  {
                    p_file_id: op.params.file_id,
                    p_token: shareToken,
                  }
                );

                let verificationInfo = null;
                if (verifyError) {
                  console.warn(`[AGENT] edit_lines: Could not verify edit:`, verifyError);
                } else if (verifyData && verifyData.length > 0) {
                  const verifiedContent = verifyData[0].content;
                  const verifiedLines = verifiedContent.split('\n');
                  console.log(`[AGENT] edit_lines: Verified file now has ${verifiedLines.length} lines (was ${totalBaseLines} lines before edit)`);
                  
                  // Provide verification info to agent
                  verificationInfo = {
                    lines_before: totalBaseLines,
                    lines_after: verifiedLines.length,
                    content_sample: verifiedLines.slice(Math.max(0, startIdx - 3), Math.min(verifiedLines.length, endIdx + 4)).join('\n'),
                  };
                }
                
                // Include the new content in result for agent to verify
                const finalLines = finalContent.split('\n');
                result.data = {
                  ...(result.data || {}),
                  new_content_preview: finalLines.slice(Math.max(0, startIdx - 2), Math.min(finalLines.length, endIdx + 3)).join('\n'),
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
                p_old_content: "",  // Empty string for new files, not NULL
                p_new_content: op.params.content,
              });
              break;
              
            case "delete_file":
              // Use agent_read_file_with_token which queries both repo_files AND repo_staging
              const { data: deleteFileData } = await supabase.rpc("agent_read_file_with_token", {
                p_file_id: op.params.file_id,
                p_token: shareToken,
              });
              
              if (deleteFileData?.[0]) {
                // Check if file was newly created (staged as "add")
                const { data: stagedForDelete } = await supabase.rpc("get_staged_changes_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                });
                
                const newlyCreated = stagedForDelete?.find(
                  (s: any) => s.file_path === deleteFileData[0].path && s.operation_type === 'add'
                );
                
                if (newlyCreated) {
                  // Just unstage the add operation instead of staging a delete
                  // FIX: Use correct parameters - repo_id and file_path, not staging_id
                  result = await supabase.rpc("unstage_file_with_token", {
                    p_repo_id: repoId,
                    p_file_path: newlyCreated.file_path,
                    p_token: shareToken,
                  });
                  console.log(`[AGENT] Unstaged newly created file: ${newlyCreated.file_path}`);
                } else {
                  // Stage the delete for a committed file
                  result = await supabase.rpc("stage_file_change_with_token", {
                    p_repo_id: repoId,
                    p_token: shareToken,
                    p_operation_type: "delete",
                    p_file_path: deleteFileData[0].path,
                    p_old_content: deleteFileData[0].content,
                  });
                  console.log(`[AGENT] Staged delete for committed file: ${deleteFileData[0].path}`);
                }
              } else {
                throw new Error(`File not found with ID: ${op.params.file_id}`);
              }
              break;
              
            case "move_file":
              // First, get file info (works for both repo_files and repo_staging)
              const { data: moveFileData } = await supabase.rpc("agent_read_file_with_token", {
                p_file_id: op.params.file_id,
                p_token: shareToken,
              });
              
              if (moveFileData?.[0]) {
                // Check if file was newly created (staged as "add")
                const { data: stagedForMove } = await supabase.rpc("get_staged_changes_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                });
                
                const newlyCreated = stagedForMove?.find(
                  (s: any) => s.file_path === moveFileData[0].path && s.operation_type === 'add'
                );
                
                if (newlyCreated) {
                  // For staged "add" files, just update the staging record's file_path
                  result = await supabase.rpc("update_staged_file_path_with_token", {
                    p_staging_id: newlyCreated.id,
                    p_new_path: op.params.new_path,
                    p_token: shareToken,
                  });
                  console.log(`[AGENT] Moved staged file from ${moveFileData[0].path} to ${op.params.new_path}`);
                } else {
                  // For committed files, use the existing move logic
                  result = await supabase.rpc("move_file_with_token", {
                    p_file_id: op.params.file_id,
                    p_new_path: op.params.new_path,
                    p_token: shareToken,
                  });
                  console.log(`[AGENT] Moved committed file from ${moveFileData[0].path} to ${op.params.new_path}`);
                }
              } else {
                throw new Error(`File not found with ID: ${op.params.file_id}`);
              }
              break;
          }
 
          if (result?.error) throw result.error;

          // Mark that files have changed for broadcast purposes
          if (["edit_lines", "create_file", "delete_file", "move_file"].includes(op.type)) {
            filesChanged = true;
          }
 
          // Update operation log to completed
          await supabase.rpc("update_agent_operation_status_with_token", {
            p_operation_id: logEntry.id,
            p_status: "completed",
            p_token: shareToken,
          });
 
          operationResults.push({ type: op.type, success: true, data: result?.data });
        } catch (error) {
          console.error("Operation failed:", error);
          
          // Properly serialize error for display
          let errorMessage: string;
          if (error instanceof Error) {
            errorMessage = error.message;
          } else if (typeof error === 'object' && error !== null) {
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
 
          operationResults.push({ 
            type: op.type, 
            success: false, 
            error: errorMessage
          });
        }
      }

      // If any file changes occurred in this iteration, broadcast a refresh event
      if (filesChanged) {
        try {
          const broadcastChannel = supabase.channel(`repo-changes-${projectId}`);
          await broadcastChannel.send({
            type: "broadcast",
            event: "repo_files_refresh",
            payload: { projectId, repoId },
          });
        } catch (broadcastError) {
          console.error("Failed to broadcast repo files refresh:", broadcastError);
        }
      }
 
      allOperationResults.push(...operationResults);
 
      // Add operation results to conversation history for next iteration
      const resultsMessage = `Operation results:\n${JSON.stringify(operationResults, null, 2)}`;
      conversationHistory.push({
        role: "assistant",
        content: JSON.stringify(agentResponse),
      });
      conversationHistory.push({
        role: "user",
        content: resultsMessage,
      });

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
    const completedAt = (finalStatus === "completed" || finalStatus === "failed") 
      ? new Date().toISOString() 
      : null;

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
      }
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
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
