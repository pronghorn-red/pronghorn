import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

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
      model = "gemini-2.5-flash", 
      maxOutputTokens = 32768, 
      thinkingEnabled = false, 
      thinkingBudget = 0,
      attachedContext = null,
      projectId = null,
      shareToken = null
    } = await req.json();

    // ========== PROJECT ACCESS VALIDATION ==========
    // Validate project access if projectId is provided (when context is attached)
    if (projectId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const authHeader = req.headers.get('Authorization');
      
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: authHeader ? { Authorization: authHeader } : {} },
      });

      const { data: project, error: accessError } = await supabase.rpc('get_project_with_token', {
        p_project_id: projectId,
        p_token: shareToken || null
      });

      if (accessError || !project) {
        console.error('[chat-stream-gemini] Access denied:', accessError);
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      console.log('[chat-stream-gemini] Access validated for project:', projectId);
    }
    // ========== END VALIDATION ==========
    
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
      if (attachedContext.databases?.length) {
        const tables = attachedContext.databases.filter((d: any) => d.type === 'table');
        const savedQueries = attachedContext.databases.filter((d: any) => d.type === 'savedQuery');
        const migrations = attachedContext.databases.filter((d: any) => d.type === 'migration');
        const hasSampleData = tables.some((t: any) => t.sampleData?.length > 0);
        const parts = [`${attachedContext.databases.length} items`];
        if (tables.length > 0) parts.push(`${tables.length} tables${hasSampleData ? ' with sample data' : ''}`);
        if (savedQueries.length > 0) parts.push(`${savedQueries.length} saved queries`);
        if (migrations.length > 0) parts.push(`${migrations.length} migrations`);
        contextParts.push(`DATABASE SCHEMAS: ${parts.join(', ')}`);
      }

      if (contextParts.length > 0) {
        const jsonString = JSON.stringify(attachedContext, null, 2);

        enrichedSystemPrompt = `${systemPrompt}\n\n===== ATTACHED PROJECT CONTEXT =====\n${contextParts.join("\n")}\n\n===== FULL CONTEXT DATA =====\n${jsonString}\n\nPlease use the above context to inform your responses. The context includes full object data with all properties and content.`;
      }
    }
    
    // Ensure maxOutputTokens is a valid number
    let validMaxTokens = 32768;
    if (typeof maxOutputTokens === 'number' && maxOutputTokens > 0) {
      validMaxTokens = maxOutputTokens;
    } else if (typeof maxOutputTokens === 'string') {
      const parsed = parseInt(maxOutputTokens, 10);
      if (!isNaN(parsed) && parsed > 0) {
        validMaxTokens = parsed;
      }
    }
    
    // Validate model
    const validModels = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"];
    const selectedModel = validModels.includes(model) ? model : "gemini-2.5-flash";
    
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    console.log("Running agent with system prompt:", enrichedSystemPrompt.substring(0, 50));
    console.log("Tool instances:", tools);

    // Execute tools if any
    let toolResults = "";
    const toolOutputs: Array<{ toolId: string; output: any }> = [];
    
    for (const toolInstance of tools) {
      const { toolId, config } = toolInstance;
      console.log("Executing tool:", toolId, "with config:", config);
      
      try {
        if (toolId === 'google_search') {
          console.log("Calling google-search with query:", userPrompt);
          const searchResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/google-search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              query: userPrompt, 
              apiKey: config?.apiKey, 
              searchEngineId: config?.searchEngineId 
            }),
          });
          const searchData = await searchResponse.json();
          console.log("Tool Output [google_search]:", JSON.stringify(searchData, null, 2));
          toolOutputs.push({ toolId: 'google_search', output: searchData });
          toolResults += `\n\nGoogle Search Results: ${JSON.stringify(searchData)}`;
        } else if (toolId === 'weather') {
          if (config?.apiKey) {
            const weatherResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/weather`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ location: "New York", apiKey: config.apiKey }),
            });
            const weatherData = await weatherResponse.json();
            console.log("Tool Output [weather]:", JSON.stringify(weatherData, null, 2));
            toolOutputs.push({ toolId: 'weather', output: weatherData });
            toolResults += `\n\nWeather Data: ${JSON.stringify(weatherData)}`;
          }
        } else if (toolId === 'time') {
          const timeResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/time`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timezone: 'UTC' }),
          });
          const timeData = await timeResponse.json();
          console.log("Tool Output [time]:", JSON.stringify(timeData, null, 2));
          toolOutputs.push({ toolId: 'time', output: timeData });
          toolResults += `\n\nCurrent Time: ${JSON.stringify(timeData)}`;
        } else if (toolId === 'web_scrape') {
          if (config?.url) {
            const scrapeResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/web-scrape`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: config.url }),
            });
            const scrapeData = await scrapeResponse.json();
            console.log("Tool Output [web_scrape]:", JSON.stringify(scrapeData, null, 2));
            toolOutputs.push({ toolId: 'web_scrape', output: scrapeData });
            toolResults += `\n\nWeb Scrape Results: ${JSON.stringify(scrapeData)}`;
          }
        } else if (toolId === 'api_call') {
          if (config?.url) {
            const headers = config.headers ? JSON.parse(config.headers) : {};
            const apiResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/api-call`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                url: config.url, 
                method: config.method || 'GET',
                headers 
              }),
            });
            const apiData = await apiResponse.json();
            console.log("Tool Output [api_call]:", JSON.stringify(apiData, null, 2));
            toolOutputs.push({ toolId: 'api_call', output: apiData });
            toolResults += `\n\nAPI Call Results: ${JSON.stringify(apiData)}`;
          }
        }
      } catch (toolError) {
        console.error(`Error executing tool ${toolId}:`, toolError);
        const errorMsg = toolError instanceof Error ? toolError.message : 'Unknown error';
        console.log("Tool Output [" + toolId + "] ERROR:", errorMsg);
        toolOutputs.push({ toolId, output: { error: errorMsg } });
        toolResults += `\n\nTool ${toolId} Error: ${errorMsg}`;
      }
    }

    // Call Gemini API directly with selected model using streaming
    const finalPrompt = toolResults ? `${userPrompt}\n\nTool Results:${toolResults}` : (userPrompt || "");
    
    console.log(`Using Gemini API with model: ${selectedModel}, streaming enabled`);
    console.log(`Thinking: ${thinkingEnabled ? 'enabled' : 'disabled'}, budget: ${thinkingBudget}`);
    
    // Build generation config
    const generationConfig: any = {
      temperature: 0.7,
      maxOutputTokens: validMaxTokens,
    };

    // Add thinking config for supported models
    if (selectedModel !== "gemini-2.5-pro") {
      generationConfig.thinkingConfig = {
        thinkingBudget: thinkingEnabled ? thinkingBudget : 0
      };
      console.log(`Added thinkingConfig with budget: ${thinkingEnabled ? thinkingBudget : 0} (${thinkingEnabled ? 'enabled' : 'disabled'})`);
    }

    // Build contents from full message history if provided
    let contentsPayload: any[] = [];

    if (Array.isArray(messages) && messages.length > 0) {
      const historyContents = messages.map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      if (enrichedSystemPrompt) {
        contentsPayload.push({
          role: "user",
          parts: [{ text: enrichedSystemPrompt }],
        });
      }

      contentsPayload = [...contentsPayload, ...historyContents];
    } else {
      contentsPayload = [
        {
          role: "user",
          parts: [
            { text: `${enrichedSystemPrompt}\n\n${finalPrompt}`.trim() }
          ]
        }
      ];
    }
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: contentsPayload,
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ],
          generationConfig
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      
      let errorDetails = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetails = JSON.stringify(errorJson, null, 2);
      } catch (e) {}
      
      throw new Error(`Gemini API error (${response.status}): ${errorDetails}`);
    }

    console.log("Starting to stream response to client");
    
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.error(new Error("No response body reader available"));
          return;
        }

        let textBuffer = "";
        let chunkCount = 0;
        let lastTextLength = 0;
        
        try {
          if (toolOutputs.length > 0) {
            const toolEvent = `data: ${JSON.stringify({ type: 'tools', toolOutputs })}\n\n`;
            controller.enqueue(encoder.encode(toolEvent));
          }

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              console.log(`Stream complete. Total chunks: ${chunkCount}, Final text length: ${lastTextLength}`);
              break;
            }

            chunkCount++;
            textBuffer += decoder.decode(value, { stream: true });
            
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
                const candidate = parsed.candidates?.[0];
                
                const text = candidate?.content?.parts?.[0]?.text;
                const finishReason = candidate?.finishReason;
                
                if (text) {
                  lastTextLength += text.length;
                  const deltaEvent = `data: ${JSON.stringify({ type: 'delta', text })}\n\n`;
                  controller.enqueue(encoder.encode(deltaEvent));
                }

                if (finishReason) {
                  console.log(`Stream finishing with reason: ${finishReason}, Total text sent: ${lastTextLength} chars`);
                  const doneEvent = `data: ${JSON.stringify({ 
                    type: 'done', 
                    finishReason,
                    truncated: finishReason === 'MAX_TOKENS'
                  })}\n\n`;
                  controller.enqueue(encoder.encode(doneEvent));
                }
              } catch (parseError) {
                console.error(`Failed to parse SSE chunk at chunk ${chunkCount}:`, parseError, `Line: ${line.substring(0, 100)}...`);
              }
            }
          }
          
          console.log(`Closing stream controller normally`);
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          try {
            controller.error(error);
          } catch (controllerError) {
            console.error("Failed to signal error to controller:", controllerError);
          }
        } finally {
          reader.releaseLock();
        }
      }
    });

    return new Response(stream, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      },
    });
  } catch (error) {
    console.error('Error in run-agent function:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      stack: errorStack,
      details: 'Full error details are available in the edge function logs'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});