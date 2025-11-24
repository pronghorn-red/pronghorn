import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      systemPrompt, 
      userPrompt, 
      messages = [], 
      tools = [], 
      model, 
      maxOutputTokens,
      thinkingEnabled = false,
      thinkingBudget = 0,
      attachedContext = null
    } = await req.json();
    
    console.log("Received request:", { model, maxOutputTokens, toolsCount: tools.length });

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    // Build enriched system prompt with attached context
    let enrichedSystemPrompt = systemPrompt;
    
    if (attachedContext) {
      const contextParts: string[] = [];

      if (attachedContext.projectMetadata) {
        contextParts.push("PROJECT METADATA: included");
      }
      if (attachedContext.artifacts?.length) {
        contextParts.push(`ARTIFACTS: ${attachedContext.artifacts.length} artifacts attached`);
      }
      if (attachedContext.chatSessions?.length) {
        contextParts.push(`CHAT SESSIONS: ${attachedContext.chatSessions.length} sessions attached`);
      }
      if (attachedContext.requirements?.length) {
        contextParts.push(`REQUIREMENTS: ${attachedContext.requirements.length} requirements attached`);
      }
      if (attachedContext.standards?.length) {
        contextParts.push(`STANDARDS: ${attachedContext.standards.length} standards attached`);
      }
      if (attachedContext.techStacks?.length) {
        contextParts.push(`TECH STACKS: ${attachedContext.techStacks.length} tech stacks attached`);
      }
      if (attachedContext.canvasNodes?.length) {
        contextParts.push(`CANVAS NODES: ${attachedContext.canvasNodes.length} nodes attached`);
      }
      if (attachedContext.canvasEdges?.length) {
        contextParts.push(`CANVAS EDGES: ${attachedContext.canvasEdges.length} edges attached`);
      }
      if (attachedContext.canvasLayers?.length) {
        contextParts.push(`CANVAS LAYERS: ${attachedContext.canvasLayers.length} layers attached`);
      }

      if (contextParts.length > 0) {
        const jsonString = JSON.stringify(attachedContext, null, 2);
        const truncatedJson = jsonString.length > 50000
          ? jsonString.slice(0, 50000) + "\n...[truncated for length]"
          : jsonString;

        enrichedSystemPrompt = `${systemPrompt}\n\n===== ATTACHED PROJECT CONTEXT =====\n${contextParts.join("\n")}\n\n===== FULL CONTEXT DATA =====\n${truncatedJson}\n\nPlease use the above context to inform your responses. The context includes full object data with all properties and content.`;
      }
    }

    // Execute tools first
    const toolResults: any[] = [];
    if (tools && tools.length > 0) {
      console.log(`Executing ${tools.length} tools...`);
      
      for (const tool of tools) {
        try {
          console.log(`Executing tool: ${tool.toolId}`);
          const toolConfig = tool.config || {};
          
          let result;
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          
          if (tool.toolId === 'google_search') {
            const response = await fetch(`${supabaseUrl}/functions/v1/google-search`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: toolConfig.query || '' })
            });
            result = await response.json();
          } else if (tool.toolId === 'weather') {
            const response = await fetch(`${supabaseUrl}/functions/v1/weather`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ location: toolConfig.location || '' })
            });
            result = await response.json();
          } else if (tool.toolId === 'time') {
            const response = await fetch(`${supabaseUrl}/functions/v1/time`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({})
            });
            result = await response.json();
          } else if (tool.toolId === 'web_scrape') {
            const response = await fetch(`${supabaseUrl}/functions/v1/web-scrape`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: toolConfig.url || '' })
            });
            result = await response.json();
          } else if (tool.toolId === 'api_call') {
            const response = await fetch(`${supabaseUrl}/functions/v1/api-call`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: toolConfig.url || '',
                method: toolConfig.method || 'GET',
                headers: toolConfig.headers || {},
                body: toolConfig.body
              })
            });
            result = await response.json();
          }
          
          console.log(`Tool ${tool.toolId} result:`, result);
          toolResults.push({
            toolId: tool.toolId,
            output: result
          });
        } catch (error) {
          console.error(`Error executing tool ${tool.toolId}:`, error);
          toolResults.push({
            toolId: tool.toolId,
            output: { error: error instanceof Error ? error.message : 'Unknown error' }
          });
        }
      }
    }

    // Prepare the final prompt with tool results
    let finalPrompt = userPrompt;
    if (toolResults.length > 0) {
      const toolResultsText = toolResults.map(tr => 
        `Tool: ${tr.toolId}\nResult: ${JSON.stringify(tr.output, null, 2)}`
      ).join('\n\n');
      finalPrompt = `${userPrompt}\n\n--- Tool Results ---\n${toolResultsText}`;
    }

    console.log("Calling Anthropic API with model:", model);

    // Create a readable stream for SSE
    console.log("Starting to stream response to client");
    
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        
        let textBuffer = "";
        let chunkCount = 0;
        let lastTextLength = 0;
        let reader;

        try {
          // Send tool outputs first if any
          if (toolResults.length > 0) {
            const toolEvent = `data: ${JSON.stringify({ type: 'tools', toolOutputs: toolResults })}\n\n`;
            controller.enqueue(encoder.encode(toolEvent));
          }

          // Stream the response from Anthropic using fetch API
          const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "anthropic-version": "2023-06-01",
              "x-api-key": anthropicApiKey,
            },
            body: JSON.stringify({
              model: model,
              max_tokens: maxOutputTokens,
              system: enrichedSystemPrompt,
              messages: (Array.isArray(messages) && messages.length > 0)
                ? messages.map((m: any) => ({
                    role: m.role === "assistant" ? "assistant" : "user",
                    content: m.content,
                  }))
                : [{
                    role: "user",
                    content: finalPrompt,
                  }],
              stream: true,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
          }

          reader = response.body?.getReader();
          
          if (!reader) {
            throw new Error("No response body reader available");
          }

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              console.log(`Stream complete. Total chunks: ${chunkCount}, Final text length: ${lastTextLength}`);
              break;
            }

            chunkCount++;
            textBuffer += decoder.decode(value, { stream: true });
            
            // Process complete lines only
            let newlineIndex: number;
            while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
              let line = textBuffer.slice(0, newlineIndex);
              textBuffer = textBuffer.slice(newlineIndex + 1);

              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (line.trim() === "" || line.startsWith(':')) continue;
              if (!line.startsWith('data: ')) continue;

              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;

              try {
                const parsed = JSON.parse(jsonStr);
                
                if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
                  const text = parsed.delta.text;
                  lastTextLength += text.length;
                  // Send text delta to client
                  const deltaEvent = `data: ${JSON.stringify({ type: 'delta', text })}\n\n`;
                  controller.enqueue(encoder.encode(deltaEvent));
                } else if (parsed.type === "message_stop") {
                  console.log(`Stream finishing with reason: STOP, Total text sent: ${lastTextLength} chars`);
                  // Send finish event to client
                  const doneEvent = `data: ${JSON.stringify({ type: 'done', finishReason: 'STOP' })}\n\n`;
                  controller.enqueue(encoder.encode(doneEvent));
                } else if (parsed.type === "error") {
                  const errorMessage = JSON.stringify({
                    type: 'error',
                    error: parsed.error?.message || "Unknown error"
                  });
                  controller.enqueue(encoder.encode(`data: ${errorMessage}\n\n`));
                }
              } catch (parseError) {
                console.error(`Failed to parse SSE chunk at chunk ${chunkCount}:`, parseError);
              }
            }
          }
          
          console.log(`Closing stream controller normally`);
          controller.close();
        } catch (error) {
          console.error('Error in Anthropic stream:', error);
          try {
            const errorMessage = JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            controller.enqueue(encoder.encode(`data: ${errorMessage}\n\n`));
            controller.close();
          } catch (controllerError) {
            console.error("Failed to signal error to controller:", controllerError);
          }
        } finally {
          reader?.releaseLock();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error in run-agent-anthropic:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
