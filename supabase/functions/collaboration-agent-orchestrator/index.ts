import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CollaborationRequest {
  collaborationId: string;
  projectId: string;
  userMessage?: string;          // Only on iteration 1
  shareToken: string;
  maxIterations?: number;
  currentContent?: string;       // Only on iteration 1
  attachedContext?: any;         // Only on iteration 1
  // Client-driven iteration support
  iteration?: number;            // Current iteration (1, 2, 3...)
  conversationHistory?: Array<{  // Passed from client after iteration 1
    role: string;
    content: string;
  }>;
  pendingOperationResults?: any[]; // Tool results from previous iteration
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
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  // Get authorization header for user context
  const authHeader = req.headers.get("Authorization");
  
  // Create client with user's auth for RLS-aware operations
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} }
  });

  try {
    const { 
      collaborationId, 
      projectId, 
      userMessage, 
      shareToken, 
      maxIterations = 100, 
      currentContent: clientContent, 
      attachedContext,
      iteration: requestedIteration,
      conversationHistory: clientConversationHistory,
      pendingOperationResults,
    } = await req.json() as CollaborationRequest;

    const iteration = requestedIteration || 1;
    const isFirstIteration = iteration === 1;
    
    console.log(`Starting collaboration agent iteration ${iteration} for collab ${collaborationId}`);
    console.log(`Attached context received:`, attachedContext ? 'yes' : 'no');
    console.log(`Pending operation results:`, pendingOperationResults?.length || 0);

    // Validate editor-level access (collaboration editing requires editor role)
    const { data: role, error: roleError } = await supabase.rpc(
      "require_role",
      { p_project_id: projectId, p_token: shareToken || null, p_min_role: "editor" }
    );

    if (roleError || !role) {
      console.error("[collaboration-agent-orchestrator] Access denied:", roleError?.message);
      return new Response(
        JSON.stringify({ error: "Editor access required for collaboration" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[collaboration-agent-orchestrator] Access validated with role: ${role}`);

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

    // Build attached context string for system prompt (only on first iteration)
    let attachedContextStr = "";
    if (isFirstIteration && attachedContext) {
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
    
    // Determine API settings based on model
    let apiKey: string;
    let modelName: string;

    if (selectedModel.startsWith("claude")) {
      apiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
      modelName = selectedModel;
    } else if (selectedModel.startsWith("grok")) {
      apiKey = Deno.env.get("XAI_API_KEY")!;
      modelName = selectedModel;
    } else {
      // Default to Gemini
      apiKey = Deno.env.get("GEMINI_API_KEY")!;
      modelName = selectedModel;
    }

    // Get recent history for context (only on first iteration)
    let historyContext = "";
    let blackboardContext = "";
    let chatContext = "";
    
    if (isFirstIteration) {
      const { data: recentHistory } = await supabase.rpc(
        "get_collaboration_history_with_token",
        { p_collaboration_id: collaborationId, p_token: shareToken }
      );

      historyContext = (recentHistory || [])
        .slice(-10)
        .map((h: any) => `v${h.version_number} (${h.actor_type}): ${h.narrative || h.operation_type}`)
        .join("\n");

      // Get blackboard entries
      const { data: blackboard } = await supabase.rpc(
        "get_collaboration_blackboard_with_token",
        { p_collaboration_id: collaborationId, p_token: shareToken }
      );

      blackboardContext = (blackboard || [])
        .slice(-10)
        .map((b: any) => `[${b.entry_type}] ${b.content}`)
        .join("\n");
      
      // Get chat history for context
      const { data: chatHistory } = await supabase.rpc(
        "get_collaboration_messages_with_token",
        { p_collaboration_id: collaborationId, p_token: shareToken }
      );

      chatContext = (chatHistory || [])
        .slice(-20)
        .map((m: any) => `${m.role}: ${m.content.slice(0, 200)}`)
        .join("\n");
    }

    // Build system prompt - document is ALWAYS auto-attached, no read_artifact needed
    const systemPrompt = `You are CollaborationAgent, a collaborative document editing assistant.

CRITICAL: Respond with ONLY valid JSON. No prose outside the JSON structure.

AVAILABLE OPERATION:
- edit_lines: Edit specific lines in the document
  Parameters: { start_line, end_line, new_content, narrative }

THE DOCUMENT IS ALWAYS PROVIDED TO YOU with line numbers in <<N>> format.
You do NOT need to call read_artifact - the current document state is included automatically.

LINE EDITING RULES:
- Line numbers reference the <<N>> prefix shown in the document
- Your new_content should NOT include <<N>> prefixes - just raw content
- You CAN make multiple edit_lines in one response
- Edits are applied from bottom-to-top automatically, so line numbers won't shift
- NEVER make overlapping edits (edit1.end_line must be < edit2.start_line)
- Use targeted, surgical edits - never replace the entire document

SYNTAX SAFETY (CRITICAL):
- Before editing code, verify your new_content has balanced brackets/braces
- Count opening { [ ( and ensure matching closing } ] )
- When inserting into the middle of code, include necessary closing elements
- ALWAYS provide a narrative explaining each edit

PERSISTENCE RULES (CRITICAL - FOLLOW STRICTLY):
- Do NOT set status to 'completed' until ALL user requirements are FULLY satisfied
- If user asks for N items (e.g., "10 chapters", "5 sections"), you MUST COUNT them explicitly
- Keep working until you have EXACTLY what was requested - partial completion is NOT acceptable
- If you've made progress but aren't done, set status to 'in_progress' with a clear progress update
- It's better to use MORE iterations than to complete prematurely
- NEVER give up - if the task requires many iterations, keep going

SELF-REFLECTION (REQUIRED before marking completed):
1. Review the document provided in each iteration
2. COUNT and verify ALL requested elements are present (e.g., "I count 10 chapters: 1, 2, 3...")
3. Check quality and syntax of each addition/change
4. Only THEN set status to 'completed' if EVERYTHING is verified
5. If count doesn't match request, set status to 'in_progress' and continue

PROGRESS TRACKING:
- After each edit, note what's done and what remains in your blackboard_entry
- Example: "Completed 3/10 chapters. Remaining: chapters 4-10. Next: writing chapter 4."
- Continue iterating until your count matches the user's exact request

${isFirstIteration ? `RECENT EDIT HISTORY:
${historyContext || "No edits yet"}

AGENT REASONING HISTORY:
${blackboardContext || "No entries yet"}

CONVERSATION HISTORY:
${chatContext || "No messages yet"}

${attachedContextStr ? `ATTACHED PROJECT CONTEXT (use this to inform your edits when relevant):
${attachedContextStr}` : ''}` : ''}

RESPONSE FORMAT:
{
  "reasoning": "Your thinking about what to do",
  "operations": [
    { "type": "edit_lines", "params": { "start_line": 1, "end_line": 3, "new_content": "...", "narrative": "..." } }
  ],
  "blackboard_entry": { "type": "planning|progress|decision|reasoning", "content": "..." },
  "status": "in_progress|completed",
  "message": "Optional message to show user"
}

Start your response with { and end with }.`;

    // Build conversation history - ALWAYS include current document content
    let conversationHistory: Array<{ role: string; content: string }> = [];
    
    if (isFirstIteration) {
      // First iteration: build initial conversation
      // NOTE: User message is already persisted by frontend - don't duplicate here
      conversationHistory.push({ 
        role: "user", 
        content: `CURRENT DOCUMENT:\n${addLineNumbers(initialDocumentContent)}\n\nUser request: ${userMessage}` 
      });
    } else {
      // Subsequent iterations: use client-provided conversation history
      conversationHistory = clientConversationHistory || [];
      
      // ALWAYS inject current document state - extract from pending results or use initial
      const latestContent = pendingOperationResults?.find((r: any) => r.updatedDocumentContent)?.updatedDocumentContent 
        || initialDocumentContent;
      
      // Build iteration context with document + operation results
      const iterationContext = pendingOperationResults && pendingOperationResults.length > 0
        ? `CURRENT DOCUMENT:\n${addLineNumbers(latestContent)}\n\nOperation results from last iteration:\n${JSON.stringify(pendingOperationResults.map((r: any) => ({ type: r.type, success: r.success, lines_affected: r.lines_affected, narrative: r.narrative })), null, 2)}`
        : `CURRENT DOCUMENT:\n${addLineNumbers(latestContent)}\n\nNo operations in previous iteration.`;
      
      conversationHistory.push({
        role: "user",
        content: iterationContext
      });
    }

    // Stream encoder for SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        // Heartbeat interval to keep connection alive during long LLM calls
        const heartbeatInterval = setInterval(() => {
          sendEvent({ type: 'heartbeat', timestamp: Date.now() });
        }, 3000);
        
        try {
          console.log(`\n=== Iteration ${iteration} ===`);
          sendEvent({ type: "iteration_start", iteration, maxIterations });

          // Make LLM call with STREAMING
          let rawOutputText = "";
          
          if (selectedModel.startsWith("gemini")) {
            // Use streaming endpoint for Gemini
            const streamEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:streamGenerateContent?key=${apiKey}&alt=sse`;
            
            const contents = conversationHistory.map((msg) => ({
              role: msg.role === "assistant" ? "model" : "user",
              parts: [{ text: msg.content }],
            }));

            const llmResponse = await fetch(streamEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents,
                generationConfig: {
                  maxOutputTokens: maxTokens,
                  temperature: 0.7,
                },
              }),
            });

            if (!llmResponse.ok) {
              const errorText = await llmResponse.text();
              throw new Error(`Gemini API error: ${llmResponse.status} - ${errorText}`);
            }

            // Stream tokens
            const reader = llmResponse.body?.getReader();
            const decoder = new TextDecoder();
            let textBuffer = "";

            if (reader) {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                textBuffer += decoder.decode(value, { stream: true });
                
                let newlineIndex: number;
                while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
                  const line = textBuffer.slice(0, newlineIndex);
                  textBuffer = textBuffer.slice(newlineIndex + 1);
                  
                  if (!line.startsWith('data: ')) continue;
                  const jsonStr = line.slice(6).trim();
                  if (!jsonStr || jsonStr === "[DONE]") continue;
                  
                  try {
                    const parsed = JSON.parse(jsonStr);
                    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
                    if (text) {
                      rawOutputText += text;
                      // Send streaming event with character count
                      sendEvent({ type: 'llm_streaming', iteration, charsReceived: rawOutputText.length, delta: text });
                    }
                  } catch (e) { /* ignore partial chunks */ }
                }
              }
              reader.releaseLock();
            }
          } else if (selectedModel.startsWith("claude")) {
            // Use streaming for Claude
            const llmResponse = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: modelName,
                max_tokens: maxTokens,
                stream: true,
                system: systemPrompt,
                messages: conversationHistory.map((msg) => ({
                  role: msg.role,
                  content: msg.content,
                })),
              }),
            });

            if (!llmResponse.ok) {
              const errorText = await llmResponse.text();
              throw new Error(`Claude API error: ${llmResponse.status} - ${errorText}`);
            }

            // Stream tokens
            const reader = llmResponse.body?.getReader();
            const decoder = new TextDecoder();
            let textBuffer = "";

            if (reader) {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                textBuffer += decoder.decode(value, { stream: true });
                
                let newlineIndex: number;
                while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
                  const line = textBuffer.slice(0, newlineIndex);
                  textBuffer = textBuffer.slice(newlineIndex + 1);
                  
                  if (!line.startsWith('data: ')) continue;
                  const jsonStr = line.slice(6).trim();
                  if (!jsonStr || jsonStr === "[DONE]") continue;
                  
                  try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                      rawOutputText += parsed.delta.text;
                      sendEvent({ type: 'llm_streaming', iteration, charsReceived: rawOutputText.length, delta: parsed.delta.text });
                    }
                  } catch (e) { /* ignore */ }
                }
              }
              reader.releaseLock();
            }
          } else {
            // Grok/xAI with streaming
            const llmResponse = await fetch("https://api.x.ai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: modelName,
                stream: true,
                messages: [
                  { role: "system", content: systemPrompt },
                  ...conversationHistory,
                ],
                max_tokens: maxTokens,
                temperature: 0.7,
              }),
            });

            if (!llmResponse.ok) {
              const errorText = await llmResponse.text();
              throw new Error(`Grok API error: ${llmResponse.status} - ${errorText}`);
            }

            // Stream tokens
            const reader = llmResponse.body?.getReader();
            const decoder = new TextDecoder();
            let textBuffer = "";

            if (reader) {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                textBuffer += decoder.decode(value, { stream: true });
                
                let newlineIndex: number;
                while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
                  const line = textBuffer.slice(0, newlineIndex);
                  textBuffer = textBuffer.slice(newlineIndex + 1);
                  
                  if (!line.startsWith('data: ')) continue;
                  const jsonStr = line.slice(6).trim();
                  if (!jsonStr || jsonStr === "[DONE]") continue;
                  
                  try {
                    const parsed = JSON.parse(jsonStr);
                    const text = parsed.choices?.[0]?.delta?.content || "";
                    if (text) {
                      rawOutputText += text;
                      sendEvent({ type: 'llm_streaming', iteration, charsReceived: rawOutputText.length, delta: text });
                    }
                  } catch (e) { /* ignore */ }
                }
              }
              reader.releaseLock();
            }
          }

          sendEvent({ type: 'llm_complete', iteration, totalChars: rawOutputText.length });

          // Parse the agent's response
          const parsed = parseAgentResponse(rawOutputText);
          console.log("Parsed response:", JSON.stringify(parsed).slice(0, 500));

          sendEvent({ type: "reasoning", reasoning: parsed.reasoning });

          // Return operations to client for execution - don't execute them here
          // The client will:
          // 1. Execute read_artifact locally (return current content)
          // 2. Execute edit_lines locally (update content, save to DB)
          // 3. Pass results back on next iteration
          
          // Update conversation history with assistant response
          // NOTE: conversationHistory already includes operation results (added at lines 346-351)
          // so this preserves the full context chain for the next iteration
          const updatedConversationHistory = [
            ...conversationHistory,
            { role: "assistant", content: JSON.stringify(parsed) }
          ];

          // Send iteration complete with operations for client to execute
          sendEvent({ 
            type: "iteration_complete", 
            iteration,
            status: parsed.status || "in_progress",
            operations: parsed.operations || [],
            blackboardEntry: parsed.blackboard_entry || null,
            message: parsed.message || null,
            conversationHistory: updatedConversationHistory,
          });

          // Extract narratives from operations (per-edit explanations)
          const narratives = (parsed.operations || [])
            .map((op: any) => op.params?.narrative)
            .filter(Boolean);

          // Build comprehensive message content with all LLM output
          const messageParts: string[] = [];

          // 1. Reasoning (main thought process)
          if (parsed.reasoning) {
            messageParts.push(parsed.reasoning);
          }

          // 2. Narratives (per-edit explanations)
          if (narratives.length > 0) {
            messageParts.push('\n\n**Actions:**');
            narratives.forEach((n: string) => messageParts.push(`- ${n}`));
          }

          // 3. Blackboard decision (if any)
          if (parsed.blackboard_entry?.content) {
            const entryType = parsed.blackboard_entry.type || 'Note';
            const capitalizedType = entryType.charAt(0).toUpperCase() + entryType.slice(1);
            messageParts.push(`\n\n**${capitalizedType}:** ${parsed.blackboard_entry.content}`);
          }

          const messageContent = messageParts.join('\n') || `[Iteration ${iteration}] Processing...`;
          
          // Persist with rich metadata for UI rendering
          await supabase.rpc("insert_collaboration_message_with_token", {
            p_collaboration_id: collaborationId,
            p_token: shareToken,
            p_role: "assistant",
            p_content: messageContent,
            p_metadata: { 
              iteration,
              status: parsed.status,
              hasOperations: (parsed.operations?.length || 0) > 0,
              narratives,
              blackboardType: parsed.blackboard_entry?.type || null,
              blackboardContent: parsed.blackboard_entry?.content || null,
            },
          });

          // Broadcast assistant message for multi-user real-time sync
          const assistantMsg = {
            id: `iter-${iteration}-${Date.now()}`,
            role: 'assistant',
            content: messageContent,
            created_at: new Date().toISOString(),
            metadata: { 
              iteration, 
              status: parsed.status,
              hasOperations: (parsed.operations?.length || 0) > 0,
            }
          };

          try {
            await supabase.channel(`collaboration-${collaborationId}`).send({
              type: 'broadcast',
              event: 'collaboration_message',
              payload: { message: assistantMsg }
            });
          } catch (broadcastError) {
            console.warn('Failed to broadcast message:', broadcastError);
          }

          clearInterval(heartbeatInterval);
          controller.close();
        } catch (error) {
          clearInterval(heartbeatInterval);
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
