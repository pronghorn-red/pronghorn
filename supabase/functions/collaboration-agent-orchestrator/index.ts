import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CollaborationRequest {
  collaborationId: string;
  projectId: string;
  userMessage: string;
  shareToken: string;
  maxIterations?: number;
  currentContent?: string; // Editor content passed from client
  attachedContext?: any; // Project context from ProjectSelector
}

function parseAgentResponse(rawText: string): any {
  const text = rawText.trim();
  console.log("Parsing agent response, length:", text.length);

  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch (e) {
    console.log("Direct parse failed, trying extraction methods");
  }

  // Try extracting from code fence
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (e) {
      console.log("Code fence parse failed");
    }
  }

  // Try brace extraction
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch (e) {
      console.log("Brace extraction failed");
    }
  }

  // Fallback
  return {
    reasoning: "Failed to parse agent response",
    operations: [],
    status: "error",
    message: text.slice(0, 500),
  };
}

// Add line numbers to content for agent readability
function addLineNumbers(content: string): string {
  const lines = content.split("\n");
  return lines.map((line, i) => `<<${i + 1}>> ${line}`).join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { collaborationId, projectId, userMessage, shareToken, maxIterations = 25, currentContent: clientContent, attachedContext } = 
      await req.json() as CollaborationRequest;

    console.log(`Starting collaboration agent for collab ${collaborationId}`);
    console.log(`Attached context received:`, attachedContext ? 'yes' : 'no');

    // Get collaboration details
    const { data: collaboration, error: collabError } = await supabase.rpc(
      "get_artifact_collaboration_with_token",
      { p_collaboration_id: collaborationId, p_token: shareToken }
    );

    if (collabError || !collaboration) {
      throw new Error(`Collaboration not found: ${collabError?.message}`);
    }
    
    // Use clientContent from client if provided (captures user's live edits), else use DB content
    const initialDocumentContent = clientContent || collaboration.current_content;

    // Build attached context string for system prompt
    let attachedContextStr = "";
    if (attachedContext) {
      const parts: string[] = [];
      
      if (attachedContext.projectMetadata) {
        parts.push(`PROJECT METADATA:\n${JSON.stringify(attachedContext.projectMetadata, null, 2)}`);
      }
      
      if (attachedContext.requirements?.length) {
        parts.push(`REQUIREMENTS:\n${attachedContext.requirements.map((r: any) => 
          `- [${r.type || 'REQ'}] ${r.title}${r.content ? ': ' + r.content.slice(0, 300) : ''}`).join('\n')}`);
      }
      
      if (attachedContext.artifacts?.length) {
        parts.push(`REFERENCED ARTIFACTS:\n${attachedContext.artifacts.map((a: any) => 
          `- ${a.ai_title || 'Untitled'}: ${(a.content || '').slice(0, 500)}...`).join('\n')}`);
      }
      
      if (attachedContext.standards?.length) {
        parts.push(`STANDARDS:\n${attachedContext.standards.map((s: any) => 
          `- ${s.name}: ${s.description || ''}`).join('\n')}`);
      }
      
      if (attachedContext.techStacks?.length) {
        parts.push(`TECH STACKS:\n${attachedContext.techStacks.map((t: any) => 
          `- ${t.name}: ${t.description || ''}`).join('\n')}`);
      }
      
      if (attachedContext.chatSessions?.length) {
        parts.push(`CHAT SESSION EXCERPTS:\n${attachedContext.chatSessions.map((c: any) => 
          `- ${c.ai_title || c.title || 'Chat'}: ${c.ai_summary || '(no summary)'}`).join('\n')}`);
      }
      
      if (attachedContext.canvasNodes?.length) {
        parts.push(`CANVAS NODES:\n${attachedContext.canvasNodes.map((n: any) => 
          `- [${n.type}] ${n.data?.label || n.data?.title || 'Node'}: ${JSON.stringify(n.data).slice(0, 200)}`).join('\n')}`);
      }
      
      if (attachedContext.files?.length) {
        parts.push(`REPOSITORY FILES:\n${attachedContext.files.map((f: any) => 
          `- ${f.path}: ${(f.content || '').slice(0, 500)}...`).join('\n')}`);
      }
      
      if (attachedContext.databases?.length) {
        parts.push(`DATABASE SCHEMAS:\n${attachedContext.databases.map((d: any) => 
          `- ${d.name} (${d.type}): ${JSON.stringify(d.columns || d.definition || d).slice(0, 300)}`).join('\n')}`);
      }
      
      attachedContextStr = parts.join('\n\n');
      console.log(`Attached context string length: ${attachedContextStr.length}`);
    }

    // Get project for model settings
    const { data: project } = await supabase.rpc("get_project_with_token", {
      p_project_id: projectId,
      p_token: shareToken,
    });

    const selectedModel = project?.selected_model || "gemini-2.5-flash";
    const maxTokens = project?.max_tokens || 16000;
    
    // Determine API endpoint and key based on model
    let apiEndpoint: string;
    let apiKey: string;
    let modelName: string;

    if (selectedModel.startsWith("claude")) {
      apiEndpoint = "https://api.anthropic.com/v1/messages";
      apiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
      modelName = selectedModel;
    } else if (selectedModel.startsWith("grok")) {
      apiEndpoint = "https://api.x.ai/v1/chat/completions";
      apiKey = Deno.env.get("XAI_API_KEY")!;
      modelName = selectedModel;
    } else {
      // Default to Gemini
      apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;
      apiKey = Deno.env.get("GEMINI_API_KEY")!;
      modelName = selectedModel;
    }

    // Get recent history for context
    const { data: recentHistory } = await supabase.rpc(
      "get_collaboration_history_with_token",
      { p_collaboration_id: collaborationId, p_token: shareToken }
    );

    const historyContext = (recentHistory || [])
      .slice(-10)
      .map((h: any) => `v${h.version_number} (${h.actor_type}): ${h.narrative || h.operation_type}`)
      .join("\n");

    // Get blackboard entries
    const { data: blackboard } = await supabase.rpc(
      "get_collaboration_blackboard_with_token",
      { p_collaboration_id: collaborationId, p_token: shareToken }
    );

    const blackboardContext = (blackboard || [])
      .slice(-10)
      .map((b: any) => `[${b.entry_type}] ${b.content}`)
      .join("\n");
    
    // Get chat history for context
    const { data: chatHistory } = await supabase.rpc(
      "get_collaboration_messages_with_token",
      { p_collaboration_id: collaborationId, p_token: shareToken }
    );

    const chatContext = (chatHistory || [])
      .slice(-20)
      .map((m: any) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join("\n");

    // Build system prompt
    const systemPrompt = `You are CollaborationAgent, a collaborative document editing assistant.

CRITICAL: Respond with ONLY valid JSON. No prose outside the JSON structure.

You can perform these operations:
1. read_artifact - Read the current document content with line numbers
2. edit_lines - Edit specific lines in the document

RULES:
- ALWAYS call read_artifact first to see current document state
- Use edit_lines for targeted, surgical edits
- NEVER replace entire document - make focused changes
- ALWAYS provide a narrative explaining each edit
- Make ONE focused edit per operation when possible

Current document content will be provided with line numbers as <<N>>.

PERSISTENCE RULES (CRITICAL - FOLLOW STRICTLY):
- Do NOT set status to 'completed' until ALL user requirements are FULLY satisfied
- If user asks for N items (e.g., "10 chapters", "5 sections"), you MUST COUNT them explicitly
- Keep working until you have EXACTLY what was requested - partial completion is NOT acceptable
- If you've made progress but aren't done, set status to 'in_progress' with a clear progress update
- It's better to use MORE iterations than to complete prematurely
- NEVER give up - if the task requires many iterations, keep going

SELF-REFLECTION (REQUIRED before marking completed):
1. Re-read the entire document using read_artifact
2. COUNT and verify ALL requested elements are present (e.g., "I count 10 chapters: 1, 2, 3...")
3. Check quality of each addition/change
4. Only THEN set status to 'completed' if EVERYTHING is verified
5. If count doesn't match request, set status to 'in_progress' and continue

PROGRESS TRACKING:
- After each edit, note what's done and what remains in your blackboard_entry
- Example: "Completed 3/10 chapters. Remaining: chapters 4-10. Next: writing chapter 4."
- Continue iterating until your count matches the user's exact request

RECENT EDIT HISTORY:
${historyContext || "No edits yet"}

AGENT REASONING HISTORY:
${blackboardContext || "No entries yet"}

CONVERSATION HISTORY:
${chatContext || "No messages yet"}

${attachedContextStr ? `ATTACHED PROJECT CONTEXT (use this to inform your edits when relevant):
${attachedContextStr}` : ''}

RESPONSE FORMAT:
{
  "reasoning": "Your thinking about what to do",
  "operations": [
    { "type": "read_artifact", "params": {} }
    // OR
    { "type": "edit_lines", "params": { "start_line": 1, "end_line": 3, "new_content": "...", "narrative": "..." } }
  ],
  "blackboard_entry": { "type": "planning|progress|decision|reasoning", "content": "..." },
  "status": "in_progress|completed",
  "message": "Optional message to show user"
}

Start your response with { and end with }.`;

    // Add user message to messages
    const { data: insertedMessage } = await supabase.rpc(
      "insert_collaboration_message_with_token",
      {
        p_collaboration_id: collaborationId,
        p_token: shareToken,
        p_role: "user",
        p_content: userMessage,
        p_metadata: {},
      }
    );

    // Iteration loop - allow more iterations for complex tasks
    const MAX_ITERATIONS = Math.min(maxIterations, 30);
    let iteration = 0;
    let conversationHistory: Array<{ role: string; content: string }> = [];
    let finalStatus = "in_progress";
    let finalMessage = "";
    let currentContent = initialDocumentContent;

    conversationHistory.push({ 
      role: "user", 
      content: `Document to collaborate on:\n${addLineNumbers(currentContent)}\n\nUser request: ${userMessage}` 
    });

    // Stream encoder for SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          while (iteration < MAX_ITERATIONS && finalStatus !== "completed") {
            iteration++;
            console.log(`\n=== Iteration ${iteration} ===`);
            sendEvent({ type: "iteration", iteration, maxIterations: MAX_ITERATIONS });

            // Call LLM
            let llmResponse: Response;

            if (selectedModel.startsWith("gemini")) {
              const contents = conversationHistory.map((msg) => ({
                role: msg.role === "assistant" ? "model" : "user",
                parts: [{ text: msg.content }],
              }));

              llmResponse = await fetch(`${apiEndpoint}?key=${apiKey}`, {
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
            } else if (selectedModel.startsWith("claude")) {
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
                  messages: conversationHistory.map((msg) => ({
                    role: msg.role,
                    content: msg.content,
                  })),
                }),
              });
            } else {
              // Grok/xAI
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
                    ...conversationHistory,
                  ],
                  max_tokens: maxTokens,
                  temperature: 0.7,
                }),
              });
            }

            if (!llmResponse.ok) {
              const errorText = await llmResponse.text();
              throw new Error(`LLM API error: ${llmResponse.status} - ${errorText}`);
            }

            const llmData = await llmResponse.json();

            // Extract response text based on provider
            let responseText: string;
            if (selectedModel.startsWith("gemini")) {
              responseText = llmData.candidates?.[0]?.content?.parts?.[0]?.text || "";
            } else if (selectedModel.startsWith("claude")) {
              responseText = llmData.content?.[0]?.text || "";
            } else {
              responseText = llmData.choices?.[0]?.message?.content || "";
            }

            const parsed = parseAgentResponse(responseText);
            console.log("Parsed response:", JSON.stringify(parsed).slice(0, 500));

            sendEvent({ type: "reasoning", reasoning: parsed.reasoning });

            // Process operations
            const operationResults: any[] = [];

            for (const op of parsed.operations || []) {
              sendEvent({ type: "operation", operation: op.type });

              if (op.type === "read_artifact") {
                // Just return current content with line numbers
                operationResults.push({
                  type: "read_artifact",
                  success: true,
                  content: addLineNumbers(currentContent),
                });
              } else if (op.type === "edit_lines") {
                const { start_line, end_line, new_content, narrative } = op.params;

                // Perform the edit
                const lines = currentContent.split("\n");
                const before = lines.slice(0, start_line - 1);
                const after = lines.slice(end_line);
                const newLines = new_content.split("\n");
                currentContent = [...before, ...newLines, ...after].join("\n");

                // Get latest version
                const { data: latestVersion } = await supabase.rpc(
                  "get_collaboration_latest_version_with_token",
                  { p_collaboration_id: collaborationId, p_token: shareToken }
                );

                const newVersion = (latestVersion || 0) + 1;

                // Insert history entry
                await supabase.rpc("insert_collaboration_edit_with_token", {
                  p_collaboration_id: collaborationId,
                  p_token: shareToken,
                  p_operation_type: "edit",
                  p_start_line: start_line,
                  p_end_line: end_line,
                  p_old_content: lines.slice(start_line - 1, end_line).join("\n"),
                  p_new_content: new_content,
                  p_new_full_content: currentContent,
                  p_narrative: narrative || "Agent edit",
                  p_actor_type: "agent",
                  p_actor_identifier: "AI Agent",
                });

                // Update collaboration current content
                await supabase.rpc("update_artifact_collaboration_with_token", {
                  p_collaboration_id: collaborationId,
                  p_token: shareToken,
                  p_current_content: currentContent,
                });

                operationResults.push({
                  type: "edit_lines",
                  success: true,
                  version: newVersion,
                  lines_affected: `${start_line}-${end_line}`,
                  narrative,
                });

                sendEvent({ 
                  type: "edit", 
                  version: newVersion, 
                  startLine: start_line, 
                  endLine: end_line,
                  narrative,
                  content: currentContent  // Send actual new content to prevent stale data
                });
              }
            }

            // Add blackboard entry if provided
            if (parsed.blackboard_entry) {
              await supabase.rpc("insert_collaboration_blackboard_with_token", {
                p_collaboration_id: collaborationId,
                p_token: shareToken,
                p_entry_type: parsed.blackboard_entry.type || "progress",
                p_content: parsed.blackboard_entry.content,
                p_metadata: {},
              });
            }

            // Update conversation history
            conversationHistory.push({
              role: "assistant",
              content: JSON.stringify(parsed),
            });

            if (operationResults.length > 0) {
              conversationHistory.push({
                role: "user",
                content: `Operation results:\n${JSON.stringify(operationResults, null, 2)}`,
              });
            }

            // Check status
            if (parsed.status === "completed") {
              finalStatus = "completed";
              finalMessage = parsed.message || "Changes completed successfully.";
            }
          }

          // Insert assistant message with final response
          await supabase.rpc("insert_collaboration_message_with_token", {
            p_collaboration_id: collaborationId,
            p_token: shareToken,
            p_role: "assistant",
            p_content: finalMessage || "I've made the requested changes to the document.",
            p_metadata: { iterations: iteration },
          });

          sendEvent({ 
            type: "done", 
            status: finalStatus, 
            message: finalMessage,
            iterations: iteration 
          });

          controller.close();
        } catch (error) {
          console.error("Collaboration agent error:", error);
          sendEvent({ type: "error", message: (error as Error).message });
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
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
