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
  attachedFileIds: string[];
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
  } catch {
    // Fallback: grab from first '{' to last '}'
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = text.slice(firstBrace, lastBrace + 1);
      return JSON.parse(candidate);
    }
    throw new Error("Unable to parse agent JSON response");
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
      attachedFileIds,
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
      p_metadata: { attachedFileIds, projectContext },
    });
    console.log("Created session:", session.id);

    // Load instruction manifest
    const manifest = {
      file_operations: {
        search: { description: "Search file paths and content by keyword" },
        read_file: { description: "Read complete content of a single file" },
        edit_lines: { description: "Edit specific line range in a file and stage the change" },
        create_file: { description: "Create new file and stage as add operation" },
        delete_file: { description: "Delete file and stage as delete operation" },
        rename_file: { description: "Rename/move file and stage as rename operation" },
      },
    } as const;

    // Load attached files
    let attachedFilesContent = "";
    if (attachedFileIds.length > 0) {
      const { data: files } = await supabase.rpc("agent_read_multiple_files_with_token", {
        p_file_ids: attachedFileIds,
        p_token: shareToken,
      });
      
      if (files) {
        attachedFilesContent = files.map(
          (f: any) => `\n\n### File: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``
        ).join("");
      }
    }

    // Build context summary from ProjectSelector data
    let contextSummary = "";
    if (projectContext) {
      const parts = [];
      if (projectContext.projectMetadata) {
        parts.push(`Project: ${projectContext.projectMetadata.name}`);
        if (projectContext.projectMetadata.description) {
          parts.push(`Description: ${projectContext.projectMetadata.description}`);
        }
      }
      if (projectContext.artifacts?.length > 0) {
        parts.push(`${projectContext.artifacts.length} artifacts available`);
      }
      if (projectContext.requirements?.length > 0) {
        parts.push(`${projectContext.requirements.length} requirements`);
      }
      if (projectContext.standards?.length > 0) {
        parts.push(`${projectContext.standards.length} standards`);
      }
      if (projectContext.canvasNodes?.length > 0) {
        parts.push(`${projectContext.canvasNodes.length} canvas nodes`);
      }
      contextSummary = parts.join("\n");
    }

    // Build system prompt
    const systemPrompt = `You are CodingAgent, an autonomous coding agent with the following capabilities:

${JSON.stringify(manifest.file_operations, null, 2)}

You can execute these file operations by responding with structured JSON containing the operations to perform.

Your task mode is: ${mode}
Auto-commit enabled: ${autoCommit}

Project Context:
${contextSummary}

Attached Files: ${attachedFilesContent}

When responding, structure your response as:
{
  "reasoning": "Your chain-of-thought reasoning about what to do next",
  "operations": [
    {
      "type": "search",
      "params": { "keyword": "string to search in paths and content" }
    },
    {
      "type": "read_file",
      "params": { "file_id": "UUID from search results" }
    },
    {
      "type": "edit_lines",
      "params": { 
        "file_id": "UUID from search/read results",
        "start_line": 1,
        "end_line": 5,
        "new_content": "replacement text"
      }
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
      "params": { "file_id": "UUID from search results" }
    },
    {
      "type": "rename_file",
      "params": { 
        "file_id": "UUID from search results",
        "new_path": "new/path/to/file.ext"
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
1. Use file_id from search results for read_file, edit_lines, delete_file, and rename_file operations
2. Only use path for create_file operation
3. Always search first to get file_id before reading, editing, deleting, or renaming
4. Work autonomously by chaining operations together
5. Set status to "in_progress" when you need to continue with more operations
6. Set status to "requires_commit" when you've made changes ready to be staged
7. Set status to "completed" when the entire task is done

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
              const { data: fileData } = await supabase.rpc("get_file_content_with_token", {
                p_file_id: op.params.file_id,
                p_token: shareToken,
              });
              
              if (fileData?.[0]) {
                const lines = fileData[0].content.split('\n');
                const startIdx = op.params.start_line - 1;
                const endIdx = op.params.end_line - 1;
                lines.splice(startIdx, endIdx - startIdx + 1, op.params.new_content);
                const newContent = lines.join('\n');
                
                result = await supabase.rpc("stage_file_change_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                  p_operation_type: "edit",
                  p_file_path: fileData[0].path,
                  p_old_content: fileData[0].content,
                  p_new_content: newContent,
                });
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
                result = await supabase.rpc("stage_file_change_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                  p_operation_type: "delete",
                  p_file_path: deleteFileData[0].path,
                  p_old_content: deleteFileData[0].content,
                });
              }
              break;
              
            case "rename_file":
              const { data: renameFileData } = await supabase.rpc("get_file_content_with_token", {
                p_file_id: op.params.file_id,
                p_token: shareToken,
              });
              
              if (renameFileData?.[0]) {
                result = await supabase.rpc("stage_file_change_with_token", {
                  p_repo_id: repoId,
                  p_token: shareToken,
                  p_operation_type: "rename",
                  p_file_path: op.params.new_path,
                  p_old_path: renameFileData[0].path,
                  p_new_content: renameFileData[0].content,
                });
              }
              break;
          }

          if (result?.error) throw result.error;

          // Update operation log to completed
          await supabase.rpc("update_agent_operation_status_with_token", {
            p_operation_id: logEntry.id,
            p_status: "completed",
            p_token: shareToken,
          });

          operationResults.push({ type: op.type, success: true, data: result?.data });
        } catch (error) {
          console.error("Operation failed:", error);
          
          // Update operation log to failed
          await supabase.rpc("update_agent_operation_status_with_token", {
            p_operation_id: logEntry.id,
            p_status: "failed",
            p_error_message: error instanceof Error ? error.message : String(error),
            p_token: shareToken,
          });

          operationResults.push({ 
            type: op.type, 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          });
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
