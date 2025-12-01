import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TaskRequest {
  projectId: string;
  taskDescription: string;
  attachedFileIds: string[];
  projectContext: any;
  shareToken: string;
  mode: 'task' | 'iterative_loop' | 'continuous_improvement';
  autoCommit?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });

    const {
      projectId,
      taskDescription,
      attachedFileIds,
      projectContext,
      shareToken,
      mode,
      autoCommit = false,
    }: TaskRequest = await req.json();

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
    console.log("Created session:", session.id);

    // Load instruction manifest (embedded to avoid external HTTP failures)
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
  "reasoning": "Your chain-of-thought reasoning",
  "operations": [
    {
      "type": "read_file" | "edit_lines" | "create_file" | "delete_file" | "rename_file" | "search",
      "params": { /* operation-specific parameters */ }
    }
  ],
  "blackboard_entry": {
    "entry_type": "planning" | "progress" | "decision" | "reasoning" | "next_steps" | "reflection",
    "content": "Your memory/reflection for this step"
  },
  "status": "in_progress" | "completed" | "requires_commit"
}

Execute file operations carefully and document your reasoning.`;

    const userPrompt = `Task: ${taskDescription}`;

    // Call LLM based on provider
    let llmResponse: any;

    if (selectedModel.startsWith("gemini")) {
      // Gemini API
      llmResponse = await fetch(`${apiEndpoint}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt },
                { text: userPrompt },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.7,
          },
        }),
      });
    } else if (selectedModel.startsWith("claude")) {
      // Anthropic API
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
          messages: [
            {
              role: "user",
              content: userPrompt,
            },
          ],
        }),
      });
    } else if (selectedModel.startsWith("grok")) {
      // xAI API
      llmResponse = await fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
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
      const text = llmData.candidates[0].content.parts[0].text;
      agentResponse = JSON.parse(text);
    } else if (selectedModel.startsWith("claude")) {
      const text = llmData.content[0].text;
      agentResponse = JSON.parse(text);
    } else if (selectedModel.startsWith("grok")) {
      const text = llmData.choices[0].message.content;
      agentResponse = JSON.parse(text);
    }

    console.log("Parsed agent response:", agentResponse);

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
            result = await supabase.rpc("agent_edit_file_lines_with_token", {
              p_file_id: op.params.file_id,
              p_start_line: op.params.start_line,
              p_end_line: op.params.end_line,
              p_new_content: op.params.new_content,
              p_token: shareToken,
            });
            break;
            
          case "create_file":
            result = await supabase.rpc("create_file_with_token", {
              p_repo_id: op.params.repo_id,
              p_path: op.params.path,
              p_content: op.params.content,
              p_token: shareToken,
            });
            break;
            
          case "delete_file":
            result = await supabase.rpc("agent_delete_file_with_token", {
              p_file_id: op.params.file_id,
              p_token: shareToken,
            });
            break;
            
          case "rename_file":
            result = await supabase.rpc("agent_rename_file_with_token", {
              p_file_id: op.params.file_id,
              p_new_path: op.params.new_path,
              p_token: shareToken,
            });
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

    // Update session status
    const finalStatus = agentResponse.status === "completed" ? "completed" : 
                       agentResponse.status === "requires_commit" ? "pending_commit" : 
                       "running";
    
    await supabase.rpc("update_agent_session_status_with_token", {
      p_session_id: session.id,
      p_status: finalStatus,
      p_token: shareToken,
    });

    console.log("Task completed with status:", finalStatus);

    return new Response(
      JSON.stringify({
        sessionId: session.id,
        status: finalStatus,
        reasoning: agentResponse.reasoning,
        operations: operationResults,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in coding-agent-orchestrator:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
