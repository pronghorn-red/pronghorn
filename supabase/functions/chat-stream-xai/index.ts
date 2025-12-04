import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
      systemPrompt = '', 
      userPrompt = '', 
      messages = [],
      tools = [], 
      model = "grok-4-fast-non-reasoning",
      maxOutputTokens = 16384,
      thinkingEnabled = false,
      thinkingBudget = 0,
      attachedContext = null
    } = await req.json();

    const XAI_API_KEY = Deno.env.get('XAI_API_KEY');
    if (!XAI_API_KEY) {
      throw new Error('XAI_API_KEY is not configured');
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
      if (attachedContext.files?.length) {
        contextParts.push(`REPOSITORY FILES: ${attachedContext.files.length} files attached`);
      }

      if (contextParts.length > 0) {
        const jsonString = JSON.stringify(attachedContext, null, 2);
        const truncatedJson = jsonString.length > 50000
          ? jsonString.slice(0, 50000) + "\n...[truncated for length]"
          : jsonString;

        enrichedSystemPrompt = `${systemPrompt}\n\n===== ATTACHED PROJECT CONTEXT =====\n${contextParts.join("\n")}\n\n===== FULL CONTEXT DATA =====\n${truncatedJson}\n\nPlease use the above context to inform your responses. The context includes full object data with all properties and content.`;
      }
    }

    console.log(`Using xAI model: ${model}`);
    console.log(`System prompt length: ${enrichedSystemPrompt.length}`);
    console.log(`User prompt length: ${userPrompt.length}`);
    console.log(`Tools requested: ${tools.length}`);

    // Execute tools if any are provided
    let toolResults = '';
    if (tools.length > 0) {
      console.log('Executing tools...');
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      
      for (const tool of tools) {
        try {
          console.log(`Executing tool: ${tool.toolId}`);
          let toolResponse;
          
          if (tool.toolId === 'google_search' || tool.toolId === 'brave_search') {
            const searchQuery = tool.config?.query || userPrompt.slice(0, 200);
            toolResponse = await fetch(`${supabaseUrl}/functions/v1/${tool.toolId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: searchQuery }),
            });
          } else if (tool.toolId === 'weather') {
            const location = tool.config?.location || 'London';
            toolResponse = await fetch(`${supabaseUrl}/functions/v1/weather`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ location }),
            });
          } else if (tool.toolId === 'time') {
            toolResponse = await fetch(`${supabaseUrl}/functions/v1/time`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
          } else if (tool.toolId === 'web_scrape') {
            const url = tool.config?.url || '';
            if (url) {
              toolResponse = await fetch(`${supabaseUrl}/functions/v1/web-scrape`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
              });
            }
          } else if (tool.toolId === 'api_call') {
            toolResponse = await fetch(`${supabaseUrl}/functions/v1/api-call`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(tool.config || {}),
            });
          }

          if (toolResponse) {
            const toolData = await toolResponse.json();
            toolResults += `\n\n=== ${tool.toolId} Results ===\n${JSON.stringify(toolData, null, 2)}`;
            console.log(`Tool ${tool.toolId} executed successfully`);
          }
        } catch (toolError) {
          console.error(`Error executing tool ${tool.toolId}:`, toolError);
          const errorMessage = toolError instanceof Error ? toolError.message : String(toolError);
          toolResults += `\n\n=== ${tool.toolId} Error ===\n${errorMessage}`;
        }
      }
    }

    // Construct the final prompt with tool results if any
    const finalPrompt = toolResults 
      ? `${userPrompt}\n\n=== Additional Context from Tools ===${toolResults}`
      : userPrompt;

    console.log(`Final prompt length: ${finalPrompt.length}`);

    // Build messages array with system prompt prepended to first user message
    // This ensures xAI/Grok properly respects the system instructions
    let messagesPayload: any[] = [];
    
    if (Array.isArray(messages) && messages.length > 0) {
      // Convert message history, prepending system prompt to first user message
      const convertedMessages = messages.map((m: any, index: number) => {
        const role = m.role === 'assistant' ? 'assistant' : 'user';
        let content = m.content;
        
        // Prepend system prompt to the first user message
        if (index === 0 && role === 'user' && enrichedSystemPrompt) {
          content = `${enrichedSystemPrompt}\n\n${content}`;
        }
        
        return { role, content };
      });
      
      messagesPayload = convertedMessages;
    } else {
      // Single turn: combine system prompt with user prompt
      messagesPayload = [
        { 
          role: 'user', 
          content: enrichedSystemPrompt 
            ? `${enrichedSystemPrompt}\n\n${finalPrompt}`
            : finalPrompt
        }
      ];
    }

    console.log(`Sending ${messagesPayload.length} messages to xAI API`);

    // Call xAI API with streaming
    const xaiResponse = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: messagesPayload,
        max_tokens: maxOutputTokens,
        stream: true,
      }),
    });

    if (!xaiResponse.ok) {
      const errorText = await xaiResponse.text();
      console.error('xAI API error:', errorText);
      throw new Error(`xAI API error: ${xaiResponse.status} - ${errorText}`);
    }

    // Stream the response back to the client
    const stream = new ReadableStream({
      async start(controller) {
        const reader = xaiResponse.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              // Send done event
              const doneData = JSON.stringify({ type: 'done' });
              controller.enqueue(new TextEncoder().encode(`data: ${doneData}\n\n`));
              controller.close();
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmedLine = line.trim();
              if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;
              
              if (trimmedLine.startsWith('data: ')) {
                const jsonStr = trimmedLine.slice(6);
                try {
                  const parsed = JSON.parse(jsonStr);
                  const content = parsed.choices?.[0]?.delta?.content;
                  
                  if (content) {
                    // Send delta event
                    const deltaData = JSON.stringify({ type: 'delta', text: content });
                    controller.enqueue(new TextEncoder().encode(`data: ${deltaData}\n\n`));
                  }
                } catch (e) {
                  console.error('Error parsing SSE data:', e);
                }
              }
            }
          }
        } catch (error) {
          console.error('Stream processing error:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorData = JSON.stringify({ type: 'error', error: errorMessage });
          controller.enqueue(new TextEncoder().encode(`data: ${errorData}\n\n`));
          controller.close();
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
    console.error('Error in run-agent-xai function:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
