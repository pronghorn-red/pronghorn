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
}

function parseAgentResponseText(rawText: string): any {
  let text = rawText.trim();

  // Try to extract JSON from a ```json ... ``` fenced block if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    text = fenceMatch[1].trim();
  } else {
    // Strip stray markdown fences if present
    text = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  }

  try {
    return JSON.parse(text);
  } catch (primaryError) {
    // Fallback: grab from first '{' to last '}' and try again
    try {
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const candidate = text.slice(firstBrace, lastBrace + 1);
        return JSON.parse(candidate);
      }
      throw primaryError;
    } catch (secondaryError) {
      console.error("Unable to parse agent JSON response", {
        primaryError,
        secondaryError,
        rawPreview: text.slice(0, 500),
      });

      // Graceful fallback: treat whole response as reasoning-only
      return {
        reasoning: rawText,
        operations: [],
        status: "parse_error",
      };
    }
  }
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
        search: { description: "Search file paths and content by keyword" },
        read_file: { description: "Read complete content of a single file" },
        edit_lines: { description: "Edit specific line range in a file and stage the change" },
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


    // Build system prompt
    const systemPrompt = `You are CodingAgent, an autonomous coding agent with the following capabilities:

${JSON.stringify(manifest.file_operations, null, 2)}

You can execute these file operations by responding with structured JSON containing the operations to perform.

Your task mode is: ${mode}
Auto-commit enabled: ${autoCommit}

Project Context:
${contextSummary}${attachedFilesSection}

CRITICAL INSTRUCTION FOR ATTACHED FILES:
${attachedFiles && attachedFiles.length > 0 
  ? `The user has attached specific file(s) with their file_id values listed above. DO NOT call list_files first - use read_file directly with the provided file_id values to work with these files immediately.`
  : `Your FIRST operation MUST be:
{
  "type": "list_files",
  "params": { "path_prefix": null }
}
This loads the complete file structure with all file IDs and paths. You CANNOT edit, read, or delete files without knowing their IDs first.`
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
      "type": "search",
      "params": { "keyword": "string to search in paths and content" }
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

CRITICAL RULES:
1. If user attached files (with file_id provided), use read_file directly with those IDs - DO NOT call list_files first
2. If no files attached, ALWAYS call list_files FIRST to load file structure before any other operations
3. Use file_id from list_files or search results for read_file, edit_lines, delete_file, and move_file operations
4. Only use path for create_file operation
5. Work autonomously by chaining operations together
6. Set status to "in_progress" when you need to continue with more operations
7. Set status to "requires_commit" when you've made changes ready to be staged
8. Set status to "completed" ONLY after completing the user's request
9. MANDATORY BEFORE EDIT_LINES: You MUST call read_file first to see the full current file content and understand line numbers
10. For edit_lines: Count lines carefully in the read_file result to determine correct start_line and end_line
11. For JSON/structured files: Ensure your edits maintain valid structure (no duplicate keys, proper syntax)

COMPLETION VALIDATION:
Before setting status="completed", ask yourself: "Have I actually answered the user's question or completed their task?" 
- If you only read a file but didn't explain it, you are NOT complete
- If you identified what to do but didn't execute it, you are NOT complete
- Review your reasoning and operations to ensure you fulfilled the user's request
- Only mark complete when you have truly delivered what the user asked for

Think step-by-step and continue until the task is complete.`;


    // Autonomous iteration loop
    const MAX_ITERATIONS = 10;
    let iteration = 0;
    let conversationHistory: Array<{ role: string; content: string }> = [];
    let finalStatus = "running";
    let allOperationResults: any[] = [];

    conversationHistory.push({ role: "user", content: `Task: ${taskDescription}` });

    while (iteration < MAX_ITERATIONS) {
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
              
            case "read_file":
              result = await supabase.rpc("agent_read_file_with_token", {
                p_file_id: op.params.file_id,
                p_token: shareToken,
              });
              break;
              
            case "edit_lines":
              // Get committed file data first
              const { data: fileData } = await supabase.rpc("get_file_content_with_token", {
                p_file_id: op.params.file_id,
                p_token: shareToken,
              });
              
              if (fileData?.[0]) {
                // Check if file is already staged to accumulate edits correctly
                const { data: stagedChanges } = await supabase.rpc("get_staged_changes_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                });
                
                const existingStaged = stagedChanges?.find((s: any) => s.file_path === fileData[0].path);
                
                // Use staged new_content as base if exists, otherwise use committed content
                const baseContent = existingStaged ? existingStaged.new_content : fileData[0].content;
                
                // Validate line numbers
                const lines = baseContent.split('\n');
                const totalLines = lines.length;
                const startIdx = op.params.start_line - 1;
                const endIdx = op.params.end_line - 1;
                
                if (startIdx < 0 || endIdx >= totalLines || startIdx > endIdx) {
                  throw new Error(
                    `Invalid line range: start_line=${op.params.start_line}, end_line=${op.params.end_line}. File has ${totalLines} lines.`
                  );
                }
                
                // Apply edit to the correct base content
                lines.splice(startIdx, endIdx - startIdx + 1, op.params.new_content);
                const newContent = lines.join('\n');
                
                // For JSON files, validate the result
                const isJsonFile = fileData[0].path.endsWith('.json');
                if (isJsonFile) {
                  try {
                    JSON.parse(newContent);
                  } catch (parseError: any) {
                    throw new Error(
                      `Edit resulted in invalid JSON. Original lines ${op.params.start_line}-${op.params.end_line} replaced with invalid content. Error: ${parseError?.message || String(parseError)}`
                    );
                  }
                }
                
                // Stage the change (UPSERT will preserve original old_content baseline)
                result = await supabase.rpc("stage_file_change_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                  p_operation_type: "edit",
                  p_file_path: fileData[0].path,
                  p_old_content: fileData[0].content,
                  p_new_content: newContent,
                });
                
                // Include the new content in result for agent to verify
                result.data = {
                  ...result.data,
                  new_content_preview: newContent.split('\n').slice(Math.max(0, startIdx - 2), Math.min(totalLines, endIdx + 3)).join('\n'),
                  total_lines: lines.length
                };
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
              const { data: deleteFileData } = await supabase.rpc("get_file_content_with_token", {
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
                  result = await supabase.rpc("unstage_file_with_token", {
                    p_staging_id: newlyCreated.id,
                    p_token: shareToken,
                  });
                } else {
                  // Stage the delete for a committed file
                  result = await supabase.rpc("stage_file_change_with_token", {
                    p_repo_id: repoId,
                    p_token: shareToken,
                    p_operation_type: "delete",
                    p_file_path: deleteFileData[0].path,
                    p_old_content: deleteFileData[0].content,
                  });
                }
              }
              break;
              
            case "move_file":
              // Use the new dedicated move_file RPC function
              result = await supabase.rpc("move_file_with_token", {
                p_file_id: op.params.file_id,
                p_new_path: op.params.new_path,
                p_token: shareToken,
              });
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
